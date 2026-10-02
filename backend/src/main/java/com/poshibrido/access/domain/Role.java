package com.poshibrido.access.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Rol del negocio con su conjunto de permisos. Los roles de sistema se siembran al crear el negocio;
 * OWNER es inmutable y no se puede asignar.
 */
@Getter
@Entity
@Table(name = "roles")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Role extends AuditableEntity {

    public static final String OWNER = "OWNER";

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column
    private String description;

    @Column(name = "system_role", nullable = false, updatable = false)
    private boolean systemRole;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Column(name = "permission_code", nullable = false)
    private Set<String> permissionCodes = new HashSet<>();

    public static Role custom(String code, String name, String description, Set<String> permissionCodes) {
        Role role = new Role();
        role.id = Ids.newId();
        role.code = code;
        role.name = name;
        role.description = description;
        role.systemRole = false;
        role.permissionCodes = new HashSet<>(permissionCodes);
        return role;
    }

    public boolean isOwner() {
        return OWNER.equals(code);
    }

    public void update(String name, String description, Set<String> permissionCodes) {
        this.name = name;
        this.description = description;
        this.permissionCodes.clear();
        this.permissionCodes.addAll(permissionCodes);
    }
}
