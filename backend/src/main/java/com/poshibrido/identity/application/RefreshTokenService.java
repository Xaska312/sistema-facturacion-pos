package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.RefreshToken;
import com.poshibrido.identity.infrastructure.RefreshTokenRepository;
import com.poshibrido.shared.error.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
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
public class RefreshTokenService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String INVALID = "La sesión expiró. Inicia sesión nuevamente.";

    private final RefreshTokenRepository repository;
    private final AuthProperties properties;

    public record Rotation(UUID userId, UUID tenantId, String newRawToken) {
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

    /** Revoca el token si existe y pertenece al usuario indicado (o a cualquiera si userId es nulo). */
    public void revoke(String rawToken, UUID expectedUserId) {
        if (rawToken == null || rawToken.isBlank()) {
            return;
        }
        find(rawToken)
                .filter(t -> expectedUserId == null || t.getUserId().equals(expectedUserId))
                .ifPresent(t -> t.revoke(Instant.now()));
    }

    public void revokeAll(UUID userId) {
        repository.revokeAllActive(userId, Instant.now());
    }

    private Optional<RefreshToken> find(String rawToken) {
        if (rawToken == null || rawToken.isBlank() || rawToken.length() > 128) {
            return Optional.empty();
        }
        return repository.findByTokenHash(hash(rawToken));
    }

    private static String newRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String hash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }
}
