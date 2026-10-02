package com.poshibrido.identity.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Invitación a un negocio por enlace. Solo se guarda el hash del token.
 * Los roles y sucursales son IDs del schema del negocio.
 */
@Getter
@Entity
@Table(name = "invitations", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Invitation extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(nullable = false, updatable = false)
    private String email;

    @Column(name = "token_hash", nullable = false, updatable = false)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InvitationStatus status;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "invited_by", nullable = false, updatable = false)
    private UUID invitedBy;

    @Column(name = "accepted_by")
    private UUID acceptedBy;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "invitation_roles", schema = "platform",
            joinColumns = @JoinColumn(name = "invitation_id"))
    @Column(name = "role_id", nullable = false)
    private Set<UUID> roleIds = new HashSet<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "invitation_branches", schema = "platform",
            joinColumns = @JoinColumn(name = "invitation_id"))
    @Column(name = "branch_id", nullable = false)
    private Set<UUID> branchIds = new HashSet<>();

    public static Invitation create(UUID tenantId, String email, String tokenHash, Set<UUID> roleIds,
                                    Set<UUID> branchIds, UUID invitedBy, Instant expiresAt) {
        Invitation invitation = new Invitation();
        invitation.id = Ids.newId();
        invitation.tenantId = tenantId;
        invitation.email = User.normalizeEmail(email);
        invitation.tokenHash = tokenHash;
        invitation.roleIds = new HashSet<>(roleIds);
        invitation.branchIds = new HashSet<>(branchIds);
        invitation.invitedBy = invitedBy;
        invitation.expiresAt = expiresAt;
        invitation.status = InvitationStatus.PENDING;
        return invitation;
    }

    public boolean isPending() {
        return status == InvitationStatus.PENDING;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public void accept(UUID userId, Instant now) {
        this.status = InvitationStatus.ACCEPTED;
        this.acceptedBy = userId;
        this.acceptedAt = now;
    }

    public void revoke() {
        this.status = InvitationStatus.REVOKED;
    }
}
