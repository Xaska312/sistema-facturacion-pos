package com.poshibrido.audit.application;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.json.Json;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.domain.TenantSchemas;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.sql.DataSource;
import java.util.Map;
import java.util.UUID;

/**
 * Registro de auditoría ({@code audit_log} del schema del negocio), solo inserción.
 * Se escribe dentro de la misma transacción que el cambio auditado.
 */
@Component
public class AuditLogger {

    private final JdbcTemplate jdbc;

    public AuditLogger(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Audita en el negocio de la petición actual. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void log(String action, String entity, Object entityId, Map<String, ?> before, Map<String, ?> after) {
        logIn(CurrentTenant.require().schema(), CurrentActor.userId().orElse(null), action, entity, entityId,
                before, after);
    }

    /** Audita en un negocio explícito (p. ej. al aceptar una invitación, sin negocio en el token). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void logIn(String tenantSchema, UUID actorId, String action, String entity, Object entityId,
                      Map<String, ?> before, Map<String, ?> after) {
        String schema = TenantSchemas.requireTenantSchema(tenantSchema);
        jdbc.update("""
                INSERT INTO %s.audit_log (id, actor_id, action, entity, entity_id, before_data, after_data, ip, created_at)
                VALUES (?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?, now())
                """.formatted(schema),
                Ids.newId(), actorId, action, entity, entityId == null ? null : entityId.toString(),
                before == null ? null : Json.write(before), after == null ? null : Json.write(after), clientIp());
    }

    private static String clientIp() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        if (attributes instanceof ServletRequestAttributes servlet) {
            HttpServletRequest request = servlet.getRequest();
            String ip = request.getRemoteAddr();
            return ip == null ? null : ip.substring(0, Math.min(ip.length(), 45));
        }
        return null;
    }
}
