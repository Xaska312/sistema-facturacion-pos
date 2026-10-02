package com.poshibrido.access.api;

import com.poshibrido.access.application.RoleService;
import com.poshibrido.access.domain.Permission;
import com.poshibrido.access.domain.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class RoleController {

    private final RoleService roles;

    public record RoleResponse(UUID id, String code, String name, String description, boolean systemRole,
                               boolean editable, List<String> permissions, long memberCount) {
        static RoleResponse of(Role role, long memberCount) {
            return new RoleResponse(role.getId(), role.getCode(), role.getName(), role.getDescription(),
                    role.isSystemRole(), !role.isOwner(), role.getPermissionCodes().stream().sorted().toList(),
                    memberCount);
        }
    }

    public record PermissionResponse(String code, String module, String description) {
        static PermissionResponse of(Permission p) {
            return new PermissionResponse(p.getCode(), p.getModule(), p.getDescription());
        }
    }

    public record CreateRoleRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z][A-Za-z0-9_]{1,39}$",
                    message = "Letras, números o '_' (2 a 40), iniciando con letra") String code,
            @NotBlank @Size(max = 100) String name,
            @Size(max = 255) String description,
            @NotEmpty Set<@NotBlank String> permissions) {
    }

    public record UpdateRoleRequest(
            @NotBlank @Size(max = 100) String name,
            @Size(max = 255) String description,
            @NotEmpty Set<@NotBlank String> permissions) {
    }

    @GetMapping("/api/v1/roles")
    @PreAuthorize("hasAnyAuthority('roles:manage', 'members:read')")
    public List<RoleResponse> list() {
        return roles.list().stream().map(r -> RoleResponse.of(r.role(), r.memberCount())).toList();
    }

    @GetMapping("/api/v1/permissions")
    @PreAuthorize("hasAnyAuthority('roles:manage', 'members:read')")
    public List<PermissionResponse> permissions() {
        return roles.catalog().stream().map(PermissionResponse::of).toList();
    }

    @PostMapping("/api/v1/roles")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('roles:manage')")
    public RoleResponse create(@Valid @RequestBody CreateRoleRequest request) {
        return RoleResponse.of(roles.create(request.code(), request.name(), request.description(),
                request.permissions()), 0);
    }

    @PutMapping("/api/v1/roles/{id}")
    @PreAuthorize("hasAuthority('roles:manage')")
    public RoleResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateRoleRequest request) {
        Role role = roles.update(id, request.name(), request.description(), request.permissions());
        return RoleResponse.of(role, roles.list().stream()
                .filter(r -> r.role().getId().equals(id)).mapToLong(r -> r.memberCount()).sum());
    }

    @DeleteMapping("/api/v1/roles/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('roles:manage')")
    public void delete(@PathVariable UUID id) {
        roles.delete(id);
    }
}
