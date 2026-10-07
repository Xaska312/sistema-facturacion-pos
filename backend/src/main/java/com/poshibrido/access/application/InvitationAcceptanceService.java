package com.poshibrido.access.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.identity.application.InvitationApi;
import com.poshibrido.identity.application.InvitationView;
import com.poshibrido.identity.application.MembershipApi;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import com.poshibrido.tenancy.domain.TenantStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Lado del invitado: ver una invitación por su enlace y aceptarla con la cuenta cuyo correo coincide.
 */
@Service
@RequiredArgsConstructor
public class InvitationAcceptanceService {

    private static final String INVALID = "El enlace de invitación no es válido.";

    private final InvitationApi invitations;
    private final UserApi users;
    private final MembershipApi memberships;
    private final TenantApi tenants;
    private final TenantMemberWriter writer;
    private final AuditLogger audit;

    public record Preview(String tenantName, String email, String invitedByName, String status, boolean expired,
                          Instant expiresAt) {
    }

    public record Accepted(UUID tenantId, String tenantName) {
    }

    @Transactional(readOnly = true)
    public Preview preview(String rawToken) {
        InvitationView invitation = invitations.findByToken(rawToken).orElseThrow(() -> new NotFoundException(INVALID));
        TenantInfo tenant = activeTenant(invitation.tenantId());
        String inviter = users.findSummaries(List.of(invitation.invitedBy())).values().stream()
                .findFirst().map(UserSummary::fullName).orElse(null);
        return new Preview(tenant.tradeName(), invitation.email(), inviter, invitation.status().name(),
                invitation.expired(), invitation.expiresAt());
    }

    @Transactional
    public Accepted accept(String rawToken, UUID userId) {
        InvitationView invitation = invitations.findByToken(rawToken).orElseThrow(() -> new NotFoundException(INVALID));
        if (!invitation.status().name().equals("PENDING")) {
            throw new ConflictException("Esta invitación ya fue usada o revocada.");
        }
        if (invitation.expired()) {
            throw new BusinessRuleException("La invitación venció. Pide un enlace nuevo a quien te invitó.");
        }
        UserSummary user = users.requireActive(userId);
        if (!user.email().equalsIgnoreCase(invitation.email())) {
            throw new ForbiddenException("Esta invitación es para " + invitation.email()
                    + ". Inicia sesión con esa cuenta para aceptarla.");
        }
        TenantInfo tenant = activeTenant(invitation.tenantId());
        String schema = tenant.schema();
        if (memberships.isActiveMember(userId, tenant.id()) && writer.isActiveMember(schema, userId)) {
            throw new ConflictException("Ya eres miembro de este negocio.");
        }
        List<UUID> roleIds = writer.existingAssignableRoles(schema, invitation.roleIds());
        List<UUID> branchIds = writer.activeBranches(schema, invitation.branchIds());
        if (roleIds.isEmpty() || branchIds.isEmpty()) {
            throw new ConflictException("Los roles o sucursales de la invitación ya no existen. Pide un enlace nuevo.");
        }

        writer.upsertMember(schema, userId, user.fullName(), roleIds, branchIds, invitation.invitedBy());
        memberships.grantActive(userId, tenant.id());
        invitations.markAccepted(invitation.id(), userId);
        // La invitación llegó a ese correo (o su dueño la compartió con esa persona): cuenta como confirmado.
        users.markEmailVerified(userId);
        audit.logIn(schema, userId, "INVITATION_ACCEPTED", "invitation", invitation.id(), null,
                Map.of("memberId", userId, "roles", roleIds, "branches", branchIds));
        return new Accepted(tenant.id(), tenant.tradeName());
    }

    private TenantInfo activeTenant(UUID tenantId) {
        return tenants.findInfo(tenantId)
                .filter(t -> t.status() == TenantStatus.ACTIVE)
                .orElseThrow(() -> new NotFoundException("El negocio de esta invitación no está disponible."));
    }
}
