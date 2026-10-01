package com.poshibrido.access.domain;

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
 * Miembro del negocio: copia mínima del usuario de plataforma (id = platform.users.id), sin credenciales.
 */
@Getter
@Entity
@Table(name = "members")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Member extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "default_branch_id")
    private UUID defaultBranchId;

    @Column(nullable = false)
    private boolean active;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "member_roles", joinColumns = @JoinColumn(name = "member_id"))
    @Column(name = "role_id", nullable = false)
    private Set<UUID> roleIds = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "member_branches", joinColumns = @JoinColumn(name = "member_id"))
    @Column(name = "branch_id", nullable = false)
    private Set<UUID> branchIds = new HashSet<>();

    public void assign(Set<UUID> newRoleIds, Set<UUID> newBranchIds, UUID newDefaultBranchId) {
        roleIds.clear();
        roleIds.addAll(newRoleIds);
        branchIds.clear();
        branchIds.addAll(newBranchIds);
        defaultBranchId = newDefaultBranchId;
    }

    public void deactivate() {
        active = false;
    }

    public void activate() {
        active = true;
    }
}
