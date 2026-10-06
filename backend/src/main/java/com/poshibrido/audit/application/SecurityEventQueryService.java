package com.poshibrido.audit.application;

import com.fasterxml.jackson.annotation.JsonRawValue;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Consulta de los eventos de seguridad de la plataforma (solo administradores de plataforma). Usa las tablas de
 * {@code platform} con su nombre completo: no depende de un negocio.
 */
@Service
public class SecurityEventQueryService {

    static final Duration DEFAULT_RANGE = Duration.ofDays(7);
    static final Duration MAX_RANGE = Duration.ofDays(367);

    /** Evento con el correo y el negocio resueltos. */
    public record SecurityEventView(UUID id, Instant occurredAt, String event, UUID userId, String email,
                                    String userName, UUID tenantId, String tenantName, String ip, String userAgent,
                                    @JsonRawValue String details) {
    }

    private final JdbcTemplate jdbc;

    public SecurityEventQueryService(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * @param from  inicio (incluido); sin valor, 7 días antes de {@code to}
     * @param to    fin (excluido); sin valor, ahora
     * @param event código de {@link SecurityEvent}
     * @param text  correo o IP (contiene)
     */
    public PageResponse<SecurityEventView> list(Instant from, Instant to, String event, UUID userId, String text,
                                                int page, int size) {
        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(DEFAULT_RANGE);
        if (!start.isBefore(end)) {
            throw new BusinessRuleException("La fecha final debe ser posterior a la inicial.");
        }
        if (Duration.between(start, end).compareTo(MAX_RANGE) > 0) {
            throw new BusinessRuleException("El rango máximo es de 367 días.");
        }
        if (event != null && !event.isBlank()) {
            try {
                SecurityEvent.valueOf(event.trim());
            } catch (IllegalArgumentException ex) {
                throw new BusinessRuleException("Evento desconocido: " + event);
            }
        }
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), PageRequests.MAX_SIZE);

        StringBuilder where = new StringBuilder(" WHERE e.occurred_at >= ? AND e.occurred_at < ?");
        List<Object> args = new ArrayList<>(List.of(Timestamp.from(start), Timestamp.from(end)));
        if (event != null && !event.isBlank()) {
            where.append(" AND e.event = ?");
            args.add(event.trim());
        }
        if (userId != null) {
            where.append(" AND e.user_id = ?");
            args.add(userId);
        }
        if (text != null && !text.isBlank()) {
            String pattern = "%" + escapeLike(text.trim().toLowerCase(Locale.ROOT)) + "%";
            where.append(" AND (coalesce(e.email, u.email) LIKE ? ESCAPE '\\' OR e.ip LIKE ? ESCAPE '\\')");
            args.add(pattern);
            args.add(pattern);
        }
        String tables = " FROM platform.security_events e"
                + " LEFT JOIN platform.users u ON u.id = e.user_id"
                + " LEFT JOIN platform.tenants t ON t.id = e.tenant_id";

        Long total = jdbc.queryForObject("SELECT count(*)" + tables + where, Long.class, args.toArray());
        long count = total == null ? 0 : total;
        List<SecurityEventView> rows = List.of();
        if (count > 0) {
            List<Object> pageArgs = new ArrayList<>(args);
            pageArgs.add(safeSize);
            pageArgs.add((long) safePage * safeSize);
            rows = jdbc.query("""
                    SELECT e.id, e.occurred_at, e.event, e.user_id, coalesce(e.email, u.email) AS email,
                           u.full_name, e.tenant_id, t.trade_name, e.ip, e.user_agent, CAST(e.details AS text) AS details
                    """ + tables + where + " ORDER BY e.occurred_at DESC, e.id DESC LIMIT ? OFFSET ?",
                    (rs, i) -> new SecurityEventView(
                            rs.getObject("id", UUID.class),
                            rs.getTimestamp("occurred_at").toInstant(),
                            rs.getString("event"),
                            rs.getObject("user_id", UUID.class),
                            rs.getString("email"),
                            rs.getString("full_name"),
                            rs.getObject("tenant_id", UUID.class),
                            rs.getString("trade_name"),
                            rs.getString("ip"),
                            rs.getString("user_agent"),
                            rs.getString("details")),
                    pageArgs.toArray());
        }
        int totalPages = (int) ((count + safeSize - 1) / safeSize);
        return new PageResponse<>(rows, safePage, safeSize, count, totalPages);
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
