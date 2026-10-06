package com.poshibrido.audit.application;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.json.Json;
import com.poshibrido.shared.web.ClientInfo;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Registro de eventos de seguridad de la plataforma ({@code platform.security_events}, solo inserción).
 * IP y navegador se toman de la petición en curso.
 */
@Component
public class SecurityEventLogger {

    private static final int MAX_EMAIL = 254;

    private final JdbcTemplate jdbc;

    public SecurityEventLogger(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * Se guarda en la transacción de quien llama (o en una propia si no hay). Para eventos de error, el caso de uso
     * declara esa excepción en {@code noRollbackFor} (p. ej. el login): así el evento queda guardado sin abrir una
     * segunda conexión. Una transacción aparte (REQUIRES_NEW) por cada intento fallido pediría dos conexiones por
     * petición y, con muchos intentos a la vez, podría agotar el pool.
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public void record(SecurityEvent event, UUID userId, String email, UUID tenantId, Map<String, ?> details) {
        jdbc.update("""
                INSERT INTO platform.security_events
                    (id, event, user_id, email, tenant_id, ip, user_agent, details, occurred_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), now())
                """,
                Ids.newId(), event.name(), userId, normalize(email), tenantId, ClientInfo.ip(), ClientInfo.userAgent(),
                details == null || details.isEmpty() ? null : Json.write(details));
    }

    private static String normalize(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        String value = email.trim().toLowerCase(Locale.ROOT);
        return value.length() <= MAX_EMAIL ? value : value.substring(0, MAX_EMAIL);
    }
}
