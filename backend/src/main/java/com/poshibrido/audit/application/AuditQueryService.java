package com.poshibrido.audit.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditViews.ActionOption;
import com.poshibrido.audit.application.AuditViews.ActorOption;
import com.poshibrido.audit.application.AuditViews.Detail;
import com.poshibrido.audit.application.AuditViews.Entry;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Consulta de la auditoría del negocio actual ({@code audit_log} con el search_path del negocio). Solo lectura:
 * la auditoría no se modifica ni se borra (trigger en V9).
 */
@Service
@Transactional(readOnly = true)
public class AuditQueryService {

    /** Límite de filas del CSV (un año de un negocio pequeño cabe con holgura). */
    static final int MAX_CSV_ROWS = 50_000;
    private static final UUID NONE = new UUID(0, 0);

    /** Nombre legible del registro: el primer dato que lo identifique, antes o después del cambio. */
    private static final String LABEL = """
            coalesce(a.after_data->>'name', a.before_data->>'name', a.after_data->>'number',
                     a.after_data->>'documentNumber', a.after_data->>'code', a.before_data->>'code',
                     a.after_data->>'email', a.before_data->>'email', a.after_data->>'tradeName')""";

    private static final String WHERE = """
            WHERE a.created_at >= :start AND a.created_at < :end
              AND (:anyActor OR a.actor_id = :actorId)
              AND (:anyEntity OR a.entity = :entity)
              AND (:anyAction OR a.action = :action)
              AND (:anyText OR a.entity_id = :exact
                   OR CAST(a.after_data AS text) ILIKE :pattern ESCAPE '\\'
                   OR CAST(a.before_data AS text) ILIKE :pattern ESCAPE '\\')""";

    private static final String COLUMNS = """
            a.id AS id, a.created_at AS created_at, a.actor_id AS actor_id, a.action AS action,
            a.entity AS entity, a.entity_id AS entity_id, %s AS label, a.ip AS ip,
            (a.before_data IS NOT NULL OR a.after_data IS NOT NULL) AS has_data""".formatted(LABEL);

    @PersistenceContext
    private EntityManager em;

    private final BusinessSettingsApi settings;
    private final MemberDirectory members;

    public AuditQueryService(BusinessSettingsApi settings, MemberDirectory members) {
        this.settings = settings;
        this.members = members;
    }

    public AuditFilter filter(LocalDate from, LocalDate to, UUID actorId, String entity, String action, String text) {
        ZoneId zone = zone();
        return AuditFilter.of(from, to, zone, LocalDate.now(zone), actorId, entity, action, text);
    }

    public ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    public PageResponse<Entry> list(AuditFilter filter, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), PageRequests.MAX_SIZE);
        long total = ((Number) bind(em.createNativeQuery("SELECT count(*) FROM audit_log a " + WHERE), filter)
                .getSingleResult()).longValue();
        List<Entry> rows = total == 0 ? List.of() : entries(filter, safeSize, (long) safePage * safeSize);
        int totalPages = (int) ((total + safeSize - 1) / safeSize);
        return new PageResponse<>(rows, safePage, safeSize, total, totalPages);
    }

    /** Todas las filas del filtro para el CSV; si pasan del límite, pide acortar el rango (no corta en silencio). */
    public List<Entry> forExport(AuditFilter filter) {
        List<Entry> rows = entries(filter, MAX_CSV_ROWS + 1, 0);
        if (rows.size() > MAX_CSV_ROWS) {
            throw new BusinessRuleException("La exportación supera " + MAX_CSV_ROWS
                    + " registros. Acorta el rango de fechas o agrega filtros.");
        }
        return rows;
    }

    public Detail detail(UUID id) {
        @SuppressWarnings("unchecked")
        List<Object[]> result = em.createNativeQuery("SELECT " + COLUMNS
                        + ", CAST(a.before_data AS text) AS before_json, CAST(a.after_data AS text) AS after_json"
                        + " FROM audit_log a WHERE a.id = :id")
                .setParameter("id", id)
                .getResultList();
        if (result.isEmpty()) {
            throw new NotFoundException("Registro de auditoría no encontrado.");
        }
        Object[] r = result.getFirst();
        UUID actorId = uuid(r[2]);
        String actorName = actorId == null ? null : members.displayNames(List.of(actorId)).get(actorId);
        return new Detail(uuid(r[0]), instant(r[1]), actorId, actorName, str(r[3]), str(r[4]), str(r[5]),
                str(r[6]), str(r[7]), str(r[9]), str(r[10]));
    }

    /** Módulos y acciones que aparecen en la auditoría del negocio (para armar los filtros). */
    public List<ActionOption> actions() {
        @SuppressWarnings("unchecked")
        List<Object[]> result = em.createNativeQuery("""
                SELECT a.entity AS entity, a.action AS action, count(*) AS total
                FROM audit_log a GROUP BY a.entity, a.action ORDER BY a.entity, a.action""").getResultList();
        return result.stream()
                .map(r -> new ActionOption(str(r[0]), str(r[1]), ((Number) r[2]).longValue()))
                .toList();
    }

    /** Personas que aparecen como autores, ordenadas por nombre. */
    public List<ActorOption> actors() {
        @SuppressWarnings("unchecked")
        List<Object> ids = em.createNativeQuery(
                "SELECT DISTINCT a.actor_id FROM audit_log a WHERE a.actor_id IS NOT NULL").getResultList();
        List<UUID> actorIds = ids.stream().map(AuditQueryService::uuid).toList();
        Map<UUID, String> names = members.displayNames(actorIds);
        return actorIds.stream()
                .map(id -> new ActorOption(id, names.get(id)))
                .sorted(Comparator.comparing((ActorOption a) -> a.name() == null ? "" : a.name(),
                        String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    // ---------------------------------------------------------------- apoyo

    private List<Entry> entries(AuditFilter filter, int limit, long offset) {
        Query query = bind(em.createNativeQuery("SELECT " + COLUMNS + " FROM audit_log a " + WHERE
                + " ORDER BY a.created_at DESC, a.id DESC LIMIT :limit OFFSET :offset"), filter);
        query.setParameter("limit", limit);
        query.setParameter("offset", offset);
        @SuppressWarnings("unchecked")
        List<Object[]> result = query.getResultList();
        List<UUID> actorIds = new ArrayList<>();
        result.forEach(r -> actorIds.add(uuid(r[2])));
        Map<UUID, String> names = members.displayNames(actorIds);
        return result.stream()
                .map(r -> {
                    UUID actorId = uuid(r[2]);
                    return new Entry(uuid(r[0]), instant(r[1]), actorId, names.get(actorId), str(r[3]), str(r[4]),
                            str(r[5]), str(r[6]), str(r[7]), Boolean.TRUE.equals(r[8]));
                })
                .toList();
    }

    private static Query bind(Query query, AuditFilter f) {
        query.setParameter("start", f.start());
        query.setParameter("end", f.end());
        query.setParameter("anyActor", f.actorId() == null);
        query.setParameter("actorId", f.actorId() == null ? NONE : f.actorId());
        query.setParameter("anyEntity", f.entity() == null);
        query.setParameter("entity", f.entity() == null ? "" : f.entity());
        query.setParameter("anyAction", f.action() == null);
        query.setParameter("action", f.action() == null ? "" : f.action());
        query.setParameter("anyText", f.text() == null);
        query.setParameter("exact", f.text() == null ? "" : f.text());
        query.setParameter("pattern", f.text() == null ? "" : "%" + escapeLike(f.text()) + "%");
        return query;
    }

    private static String escapeLike(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String str(Object value) {
        return value == null ? null : value.toString();
    }

    private static UUID uuid(Object value) {
        if (value == null) {
            return null;
        }
        return value instanceof UUID u ? u : UUID.fromString(value.toString());
    }

    private static Instant instant(Object value) {
        return switch (value) {
            case null -> null;
            case Instant i -> i;
            case OffsetDateTime o -> o.toInstant();
            case ZonedDateTime z -> z.toInstant();
            case Timestamp t -> t.toInstant();
            default -> Instant.parse(value.toString());
        };
    }
}
