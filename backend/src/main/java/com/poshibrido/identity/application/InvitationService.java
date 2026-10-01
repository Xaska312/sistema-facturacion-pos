package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.Invitation;
import com.poshibrido.identity.domain.InvitationStatus;
import com.poshibrido.identity.domain.User;
import com.poshibrido.identity.infrastructure.InvitationRepository;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InvitationService implements InvitationApi {

    static final Duration VALIDITY = Duration.ofDays(7);

    private final InvitationRepository invitations;

    @Override
    @Transactional
    public Created create(UUID tenantId, String email, Set<UUID> roleIds, Set<UUID> branchIds, UUID invitedBy) {
        String normalized = User.normalizeEmail(email);
        Instant now = Instant.now();
        Optional<Invitation> pending = invitations.findByTenantIdAndEmailAndStatus(tenantId, normalized,
                InvitationStatus.PENDING);
        if (pending.isPresent()) {
            if (!pending.get().isExpired(now)) {
                throw new ConflictException("Ya hay una invitación pendiente para " + normalized
                        + ". Revócala para generar un enlace nuevo.");
            }
            // Una invitación vencida se revoca sola. Se escribe ya (flush) porque el índice único
            // de pendientes se evalúa antes que el UPDATE si Hibernate ordena el INSERT primero.
            pending.get().revoke();
            invitations.flush();
        }
        String raw = SecureTokens.newToken();
        Invitation saved = invitations.save(Invitation.create(tenantId, normalized, SecureTokens.sha256(raw),
                roleIds, branchIds, invitedBy, now.plus(VALIDITY)));
        return new Created(InvitationView.of(saved, now), raw);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<InvitationView> listForTenant(UUID tenantId, boolean onlyPending, Pageable pageable) {
        Instant now = Instant.now();
        Page<Invitation> page = onlyPending
                ? invitations.findByTenantIdAndStatus(tenantId, InvitationStatus.PENDING, pageable)
                : invitations.findByTenantId(tenantId, pageable);
        return page.map(i -> InvitationView.of(i, now));
    }

    @Override
    @Transactional
    public InvitationView revoke(UUID tenantId, UUID invitationId) {
        Invitation invitation = invitations.findByIdAndTenantId(invitationId, tenantId)
                .orElseThrow(() -> new NotFoundException("Invitación no encontrada."));
        if (!invitation.isPending()) {
            throw new ConflictException("Solo se pueden revocar invitaciones pendientes.");
        }
        invitation.revoke();
        return InvitationView.of(invitation, Instant.now());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<InvitationView> findByToken(String rawToken) {
        if (!SecureTokens.looksValid(rawToken)) {
            return Optional.empty();
        }
        Instant now = Instant.now();
        return invitations.findByTokenHash(SecureTokens.sha256(rawToken)).map(i -> InvitationView.of(i, now));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void markAccepted(UUID invitationId, UUID userId) {
        Invitation invitation = invitations.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitación no encontrada."));
        if (!invitation.isPending()) {
            throw new ConflictException("La invitación ya no está pendiente.");
        }
        invitation.accept(userId, Instant.now());
    }
}
