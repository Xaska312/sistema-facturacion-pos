package com.poshibrido.identity.infrastructure;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Contador de intentos fallidos con una sola sentencia SQL (atómica). Con la entidad {@code User} y su
 * {@code @Version}, varios intentos en paralelo leían el mismo contador y solo uno se guardaba (los demás fallaban
 * por bloqueo optimista): una ráfaga evitaba el bloqueo y no quedaba en los eventos (QA SEG-4). Mismas reglas que
 * {@code User.registerFailedLogin}: al llegar al máximo se bloquea y el contador vuelve a 0.
 */
@Component
public class LoginAttemptStore {

    private final JdbcTemplate jdbc;

    public LoginAttemptStore(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Suma un intento fallido; devuelve hasta cuándo quedó bloqueada la cuenta (null si no se bloqueó). */
    @Transactional(propagation = Propagation.MANDATORY)
    public Instant registerFailure(UUID userId, int maxAttempts, Duration lockDuration, Instant now) {
        Timestamp until = Timestamp.from(now.plus(lockDuration));
        return jdbc.query("""
                        UPDATE platform.users
                        SET locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
                            failed_attempts = CASE WHEN failed_attempts + 1 >= ? THEN 0 ELSE failed_attempts + 1 END
                        WHERE id = ?
                        RETURNING locked_until""",
                rs -> {
                    if (!rs.next()) {
                        return null;
                    }
                    Timestamp locked = rs.getTimestamp(1);
                    return locked == null || !locked.toInstant().isAfter(now) ? null : locked.toInstant();
                },
                maxAttempts, until, maxAttempts, userId);
    }
}
