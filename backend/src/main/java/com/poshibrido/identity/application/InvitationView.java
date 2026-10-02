package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.Invitation;
import com.poshibrido.identity.domain.InvitationStatus;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

/**
 * Datos de una invitación para otros módulos. Si la invitación está pendiente pero venció,
 * {@code expired} es verdadero.
 */
public record InvitationView(UUID id, UUID tenantId, String email, InvitationStatus status, boolean expired,
                             Instant expiresAt, UUID invitedBy, UUID acceptedBy, Instant acceptedAt,
                             Instant createdAt, Set<UUID> roleIds, Set<UUID> branchIds) {

    public static InvitationView of(Invitation invitation, Instant now) {
        return new InvitationView(invitation.getId(), invitation.getTenantId(), invitation.getEmail(),
                invitation.getStatus(), invitation.isPending() && invitation.isExpired(now),
                invitation.getExpiresAt(), invitation.getInvitedBy(), invitation.getAcceptedBy(),
                invitation.getAcceptedAt(), invitation.getCreatedAt(),
                Set.copyOf(invitation.getRoleIds()), Set.copyOf(invitation.getBranchIds()));
    }
}
