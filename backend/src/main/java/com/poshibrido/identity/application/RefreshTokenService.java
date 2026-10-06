package com.poshibrido.identity.application;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.domain.RefreshToken;
import com.poshibrido.identity.infrastructure.RefreshTokenRepository;
import com.poshibrido.shared.error.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Refresh tokens opacos, guardados hasheados, rotados en cada uso. Si se presenta un token ya
 * rotado/revocado (posible robo) se revocan todas las sesiones del usuario.
 * Todos los métodos deben ejecutarse dentro de la transacción del caso de uso que los llama.
 * Un 401 no revierte la transacción: la revocación por reutilización debe quedar guardada.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(propagation = Propagation.MANDATORY, noRollbackFor = UnauthorizedException.class)
public class RefreshTokenService implements SessionApi {

    private static final String INVALID = "La sesión expiró. Inicia sesión nuevamente.";

    private final RefreshTokenRepository repository;
    private final AuthProperties properties;
    private final SecurityEventLogger securityEvents;

    public record Rotation(UUID userId, UUID tenantId, String newRawToken) {
    }

    /** Sesión cerrada al revocar su refresh token ({@code tenantId} nulo = sesión de plataforma). */
    public record ClosedSession(UUID userId, UUID tenantId) {
    }

    public String create(UUID userId, UUID tenantId) {
        String raw = newRawToken();
        Instant now = Instant.now();
        repository.save(RefreshToken.issue(userId, tenantId, hash(raw), now, now.plus(properties.refreshTokenTtl())));
        return raw;
    }

    public Rotation rotate(String rawToken) {
        Instant now = Instant.now();
        RefreshToken current = find(rawToken).orElseThrow(() -> new UnauthorizedException(INVALID));
        if (current.isRevoked()) {
            log.warn("Reutilización de refresh token detectada para el usuario {}: se revocan sus sesiones",
                    current.getUserId());
            repository.revokeAllActive(current.getUserId(), now);
            securityEvents.record(SecurityEvent.REFRESH_TOKEN_REUSED, current.getUserId(), null,
                    current.getTenantId(), null);
            throw new UnauthorizedException(INVALID);
        }
        if (current.isExpired(now)) {
            current.revoke(now);
            throw new UnauthorizedException(INVALID);
        }
        String raw = newRawToken();
        RefreshToken next = repository.save(RefreshToken.issue(current.getUserId(), current.getTenantId(), hash(raw),
                now, now.plus(properties.refreshTokenTtl())));
        current.replaceWith(next.getId(), now);
        return new Rotation(current.getUserId(), current.getTenantId(), raw);
    }

    /**
     * Revoca el token si existe, sigue activo y pertenece al usuario indicado (o a cualquiera si userId es nulo).
     *
     * @return la sesión que se cerró (vacío si el token no existía o ya estaba revocado)
     */
    public Optional<ClosedSession> revoke(String rawToken, UUID expectedUserId) {
        if (rawToken == null || rawToken.isBlank()) {
            return Optional.empty();
        }
        return find(rawToken)
                .filter(t -> expectedUserId == null || t.getUserId().equals(expectedUserId))
                .filter(t -> !t.isRevoked())
                .map(t -> {
                    t.revoke(Instant.now());
                    return new ClosedSession(t.getUserId(), t.getTenantId());
                });
    }

    public void revokeAll(UUID userId) {
        repository.revokeAllActive(userId, Instant.now());
    }

    @Override
    public void revokeTenantSessions(UUID userId, UUID tenantId) {
        repository.revokeActiveForTenant(userId, tenantId, Instant.now());
    }

    private Optional<RefreshToken> find(String rawToken) {
        if (!SecureTokens.looksValid(rawToken)) {
            return Optional.empty();
        }
        return repository.findByTokenHash(hash(rawToken));
    }

    private static String newRawToken() {
        return SecureTokens.newToken();
    }

    static String hash(String raw) {
        return SecureTokens.sha256(raw);
    }
}
