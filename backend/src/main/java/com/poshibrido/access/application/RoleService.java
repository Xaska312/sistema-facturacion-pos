package com.poshibrido.access.application;

import com.poshibrido.access.domain.Permission;
import com.poshibrido.access.domain.Role;
import com.poshibrido.access.infrastructure.MemberRepository;
import com.poshibrido.access.infrastructure.PermissionRepository;
import com.poshibrido.access.infrastructure.RoleRepository;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Roles del negocio. Los cambios de permisos aplican a los usuarios en su siguiente renovación de sesión.
 */
@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roles;
    private final PermissionRepository permissions;
    private final MemberRepository members;
    private final PrivilegeGuard guard;
    private final AuditLogger audit;

    public record RoleWithUsage(Role role, long memberCount) {
    }

    @Transactional(readOnly = true)
    public List<RoleWithUsage> list() {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : members.countByRole()) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return roles.findAll(Sort.by("name")).stream()
                .map(r -> new RoleWithUsage(r, counts.getOrDefault(r.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Permission> catalog() {
        return permissions.findAll(Sort.by("module", "code"));
    }

    @Transactional(readOnly = true)
    public Role get(UUID id) {
        return roles.findById(id).orElseThrow(() -> new NotFoundException("Rol no encontrado."));
    }

    @Transactional
    public Role create(String rawCode, String name, String description, Set<String> permissionCodes) {
        String code = rawCode.trim().toUpperCase(Locale.ROOT);
        if (roles.existsByCode(code)) {
            throw new ConflictException("Ya existe un rol con el código " + code + ".");
        }
        Set<String> perms = validPermissions(permissionCodes);
        guard.requireHolds(perms, "crear este rol");
        Role role = roles.save(Role.custom(code, name.trim(), blankToNull(description), perms));
        audit.log("ROLE_CREATED", "role", role.getId(), null, snapshot(role));
        return role;
    }

    @Transactional
    public Role update(UUID id, String name, String description, Set<String> permissionCodes) {
        Role role = get(id);
        if (role.isOwner()) {
            throw new BusinessRuleException("El rol Propietario no se puede modificar.");
        }
        Set<String> perms = validPermissions(permissionCodes);
        Set<String> touched = new HashSet<>(role.getPermissionCodes());
        touched.addAll(perms);
        guard.requireHolds(touched, "modificar este rol");
        Map<String, Object> before = snapshot(role);
        role.update(name.trim(), blankToNull(description), perms);
        audit.log("ROLE_UPDATED", "role", id, before, snapshot(role));
        return role;
    }

    @Transactional
    public void delete(UUID id) {
        Role role = get(id);
        if (role.isSystemRole()) {
            throw new BusinessRuleException("Los roles del sistema no se pueden eliminar.");
        }
        guard.requireHolds(role.getPermissionCodes(), "eliminar este rol");
        long assigned = members.countWithRole(id);
        if (assigned > 0) {
            throw new ConflictException("El rol está asignado a " + assigned + " usuario(s). Quítaselo antes de eliminarlo.");
        }
        Map<String, Object> before = snapshot(role);
        roles.delete(role);
        audit.log("ROLE_DELETED", "role", id, before, null);
    }

    /** Roles existentes con esos IDs; lanza 422 si alguno no existe. */
    @Transactional(readOnly = true)
    public List<Role> requireAll(Collection<UUID> ids) {
        List<Role> found = roles.findAllById(ids);
        if (found.size() != new HashSet<>(ids).size()) {
            throw new BusinessRuleException("Alguno de los roles indicados no existe.");
        }
        return found;
    }

    private Set<String> validPermissions(Set<String> requested) {
        if (requested == null || requested.isEmpty()) {
            throw new BusinessRuleException("El rol debe tener al menos un permiso.");
        }
        Set<String> known = permissions.findAllById(requested).stream()
                .map(Permission::getCode)
                .collect(Collectors.toSet());
        Set<String> unknown = new TreeSet<>(requested);
        unknown.removeAll(known);
        if (!unknown.isEmpty()) {
            throw new BusinessRuleException("Permisos desconocidos: " + String.join(", ", unknown) + ".");
        }
        return known;
    }

    private static Map<String, Object> snapshot(Role role) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", role.getCode());
        data.put("name", role.getName());
        data.put("description", role.getDescription());
        data.put("permissions", new TreeSet<>(role.getPermissionCodes()));
        return data;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
