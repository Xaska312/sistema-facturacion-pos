package com.poshibrido.access.application;

import com.poshibrido.access.domain.Member;
import com.poshibrido.access.domain.Role;
import com.poshibrido.access.infrastructure.MemberRepository;
import com.poshibrido.access.infrastructure.RoleRepository;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.identity.application.SessionApi;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BranchApi.BranchRef;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import com.poshibrido.tenancy.application.TenantRef;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Administración de miembros del negocio actual. Reglas:
 * <ul>
 *   <li>El propietario del negocio no se puede modificar ni desactivar.</li>
 *   <li>Nadie puede modificarse a sí mismo (evita auto-escalada o auto-bloqueo).</li>
 *   <li>Solo se gestiona a quien tiene permisos que el actor también tiene, y solo se asignan roles así.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class MemberService {

    private final MemberRepository members;
    private final RoleRepository roles;
    private final RoleService roleService;
    private final BranchApi branches;
    private final UserApi users;
    private final TenantApi tenants;
    private final SessionApi sessions;
    private final PrivilegeGuard guard;
    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public Page<MemberView> list(String search, Pageable pageable) {
        Page<Member> page = search == null || search.isBlank()
                ? members.findAll(pageable)
                : members.findByDisplayNameContainingIgnoreCase(search.trim(), pageable);
        List<MemberView> views = toViews(page.getContent());
        return page.map(m -> views.stream().filter(v -> v.id().equals(m.getId())).findFirst().orElseThrow());
    }

    @Transactional(readOnly = true)
    public MemberView get(UUID id) {
        return toViews(List.of(find(id))).getFirst();
    }

    @Transactional
    public MemberView update(UUID id, Set<UUID> roleIds, Set<UUID> branchIds, UUID defaultBranchId) {
        Member member = find(id);
        requireCanManage(member);
        List<Role> newRoles = roleService.requireAll(roleIds);
        guard.requireCanAssign(newRoles);
        Set<UUID> validBranches = requireActiveBranches(branchIds);
        UUID defaultBranch = defaultBranchId == null ? validBranches.iterator().next() : defaultBranchId;
        if (!validBranches.contains(defaultBranch)) {
            throw new BusinessRuleException("La sucursal predeterminada debe estar entre las sucursales asignadas.");
        }
        Map<String, Object> before = snapshot(member);
        member.assign(new HashSet<>(roleIds), validBranches, defaultBranch);
        audit.log("MEMBER_UPDATED", "member", id, before, snapshot(member));
        return toViews(List.of(member)).getFirst();
    }

    @Transactional
    public MemberView setActive(UUID id, boolean active) {
        Member member = find(id);
        requireCanManage(member);
        if (member.isActive() != active) {
            if (active) {
                member.activate();
            } else {
                member.deactivate();
                sessions.revokeTenantSessions(id, CurrentTenant.require().id());
            }
            audit.log(active ? "MEMBER_ACTIVATED" : "MEMBER_DEACTIVATED", "member", id, null, null);
        }
        return toViews(List.of(member)).getFirst();
    }

    private Member find(UUID id) {
        return members.findById(id).orElseThrow(() -> new NotFoundException("Usuario no encontrado en este negocio."));
    }

    private void requireCanManage(Member member) {
        UUID actor = CurrentActor.requireUserId();
        if (member.getId().equals(ownerId())) {
            throw new ForbiddenException("El propietario del negocio no se puede modificar.");
        }
        if (member.getId().equals(actor)) {
            throw new BusinessRuleException("No puedes modificar tu propio usuario. Pídeselo a otro administrador.");
        }
        Set<String> current = roles.findAllById(member.getRoleIds()).stream()
                .flatMap(r -> r.getPermissionCodes().stream())
                .collect(Collectors.toSet());
        guard.requireHolds(current, "gestionar a este usuario");
    }

    private Set<UUID> requireActiveBranches(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessRuleException("Asigna al menos una sucursal.");
        }
        List<BranchRef> found = branches.findByIds(ids);
        if (found.size() != new HashSet<>(ids).size() || found.stream().anyMatch(b -> !b.active())) {
            throw new BusinessRuleException("Alguna de las sucursales no existe o está inactiva.");
        }
        return found.stream().map(BranchRef::id).collect(Collectors.toCollection(HashSet::new));
    }

    private UUID ownerId() {
        TenantRef tenant = CurrentTenant.require();
        return tenants.findInfo(tenant.id()).map(TenantInfo::ownerUserId).orElse(null);
    }

    private List<MemberView> toViews(List<Member> list) {
        if (list.isEmpty()) {
            return List.of();
        }
        UUID owner = ownerId();
        Map<UUID, UserSummary> userById = users.findSummaries(list.stream().map(Member::getId).toList());
        Set<UUID> roleIds = list.stream().flatMap(m -> m.getRoleIds().stream()).collect(Collectors.toSet());
        Map<UUID, Role> roleById = roles.findAllById(roleIds).stream()
                .collect(Collectors.toMap(Role::getId, Function.identity()));
        Set<UUID> branchIds = list.stream().flatMap(m -> m.getBranchIds().stream()).collect(Collectors.toSet());
        Map<UUID, BranchRef> branchById = branches.findByIds(branchIds).stream()
                .collect(Collectors.toMap(BranchRef::id, Function.identity()));

        return list.stream().map(m -> new MemberView(
                m.getId(),
                m.getDisplayName(),
                userById.containsKey(m.getId()) ? userById.get(m.getId()).email() : null,
                m.isActive(),
                m.getId().equals(owner),
                m.getRoleIds().stream().map(roleById::get).filter(r -> r != null)
                        .map(r -> new MemberView.RoleRef(r.getId(), r.getCode(), r.getName()))
                        .sorted(Comparator.comparing(MemberView.RoleRef::name)).toList(),
                m.getBranchIds().stream().map(branchById::get).filter(b -> b != null)
                        .map(b -> new MemberView.BranchRefView(b.id(), b.code(), b.name()))
                        .sorted(Comparator.comparing(MemberView.BranchRefView::code)).toList(),
                m.getDefaultBranchId())).toList();
    }

    private static Map<String, Object> snapshot(Member member) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("roles", new TreeSet<>(member.getRoleIds()));
        data.put("branches", new TreeSet<>(member.getBranchIds()));
        data.put("defaultBranchId", member.getDefaultBranchId());
        data.put("active", member.isActive());
        return data;
    }
}
