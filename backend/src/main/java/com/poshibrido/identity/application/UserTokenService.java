package com.poshibrido.identity.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.id.Ids;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Enlaces de un solo uso para confirmar el correo y restablecer la contraseña ({@code platform.user_tokens}).
 * Se guarda solo el hash; emitir uno nuevo invalida los anteriores del mismo propósito. Se ejecuta dentro de la
 * transacción del caso de uso.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class UserTokenService {

    public enum Purpose {
        VERIFY_EMAIL(Duration.ofHours(24)),
        RESET_PASSWORD(Duration.ofHours(1));

        private final Duration validity;

        Purpose(Duration validity) {
            this.validity = validity;
        }

        public Duration validity() {
            return validity;
        }
    }

    static final String INVALID = "El enlace no es válido o ya venció. Pide uno nuevo.";

    private final JdbcTemplate jdbc;

    public UserTokenService(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Emite un enlace nuevo (invalida los anteriores sin usar del mismo propósito) y devuelve el token. */
    public String issue(UUID userId, Purpose purpose) {
        Instant now = Instant.now();
        jdbc.update("UPDATE platform.user_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL",
                Timestamp.from(now), userId, purpose.name());
        String raw = SecureTokens.newToken();
        jdbc.update("""
                INSERT INTO platform.user_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)""",
                Ids.newId(), userId, purpose.name(), SecureTokens.sha256(raw),
                Timestamp.from(now.plus(purpose.validity())), Timestamp.from(now));
        return raw;
    }

    /**
     * Usa el enlace: si es válido, vigente y no usado, lo marca usado y devuelve el usuario. Si no, 422 con un
     * mensaje para pedir uno nuevo (sin decir si existía, venció o ya se usó).
     */
    public UUID consume(String rawToken, Purpose purpose) {
        if (!SecureTokens.looksValid(rawToken)) {
            throw new BusinessRuleException(INVALID);
        }
        List<UUID> found = jdbc.query("""
                SELECT user_id FROM platform.user_tokens
                WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > now()
                FOR UPDATE""",
                (rs, i) -> rs.getObject("user_id", UUID.class), SecureTokens.sha256(rawToken), purpose.name());
        if (found.isEmpty()) {
            throw new BusinessRuleException(INVALID);
        }
        jdbc.update("UPDATE platform.user_tokens SET used_at = now() WHERE token_hash = ?",
                SecureTokens.sha256(rawToken));
        return found.getFirst();
    }

    /** Cuándo se emitió el último enlace de ese propósito (para no reenviar correos en ráfaga). */
    @Transactional(propagation = Propagation.SUPPORTS, readOnly = true)
    public Optional<Instant> lastIssuedAt(UUID userId, Purpose purpose) {
        List<Timestamp> found = jdbc.queryForList("""
                SELECT max(created_at) FROM platform.user_tokens WHERE user_id = ? AND purpose = ?""",
                Timestamp.class, userId, purpose.name());
        return found.isEmpty() || found.getFirst() == null ? Optional.empty() : Optional.of(found.getFirst().toInstant());
    }
}
