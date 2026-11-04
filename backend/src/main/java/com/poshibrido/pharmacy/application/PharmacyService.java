package com.poshibrido.pharmacy.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Farmacia (Fase 13-4, decisión 282): el libro de dispensación (qué se vendió con fórmula, a quién, quién la firmó, de
 * qué lote y quién lo dispensó) y los datos del director técnico del establecimiento, que salen en las actas.
 */
@Service
@RequiredArgsConstructor
public class PharmacyService {

    static final String DT_NAME = "technical_director_name";
    static final String DT_PROFESSION = "technical_director_profession";
    static final String DT_LICENSE = "technical_director_license";
    /** Químico farmacéutico, tecnólogo en regencia de farmacia, técnico/auxiliar (droguería). */
    public static final Set<String> PROFESSIONS = Set.of("PHARMACIST", "PHARMACY_REGENT", "PHARMACY_TECHNICIAN");

    @PersistenceContext
    private EntityManager em;

    private final MemberDirectory members;
    private final AuditLogger audit;
    private final BusinessSettingsApi settings;

    public record TechnicalDirector(String name, String profession, String license) {
    }

    public record LineView(String productName, String sku, BigDecimal quantity, String unitCode, String saleCondition,
                           boolean antibiotic, String lots) {
    }

    public record DispensationView(UUID saleId, String saleNumber, Instant dispensedAt, String branchName,
                                   String dispensedByName, boolean antibiotic, boolean controlled,
                                   String prescriberName, String prescriberLicense, LocalDate prescriptionDate,
                                   String patientDocument, String patientName, boolean voided, List<LineView> lines) {
    }

    // ------------------------------------------------------------------ director técnico

    @Transactional(readOnly = true)
    public TechnicalDirector technicalDirector() {
        Map<String, String> v = new HashMap<>();
        for (Object o : em.createNativeQuery(
                "SELECT setting_key, setting_value FROM business_settings WHERE setting_key IN (?1, ?2, ?3)")
                .setParameter(1, DT_NAME).setParameter(2, DT_PROFESSION).setParameter(3, DT_LICENSE).getResultList()) {
            Object[] r = (Object[]) o;
            v.put((String) r[0], (String) r[1]);
        }
        return new TechnicalDirector(blank(v.get(DT_NAME)), blank(v.get(DT_PROFESSION)), blank(v.get(DT_LICENSE)));
    }

    @Transactional
    public TechnicalDirector saveTechnicalDirector(TechnicalDirector in) {
        String name = limit(in.name(), 160, "nombre");
        String license = limit(in.license(), 40, "tarjeta profesional");
        String profession = blank(in.profession());
        if (profession != null && !PROFESSIONS.contains(profession)) {
            throw new BusinessRuleException("Elige la profesión del director técnico.");
        }
        if (name != null && (profession == null || license == null)) {
            throw new BusinessRuleException("Escribe la profesión y el número de la tarjeta profesional del director "
                    + "técnico.");
        }
        TechnicalDirector before = technicalDirector();
        UUID actor = CurrentActor.userId().orElse(null);
        put(DT_NAME, name, actor);
        put(DT_PROFESSION, profession, actor);
        put(DT_LICENSE, license, actor);
        TechnicalDirector after = new TechnicalDirector(name, profession, license);
        audit.log("TECHNICAL_DIRECTOR_UPDATED", "business_settings", null, map(before), map(after));
        return after;
    }

    private void put(String key, String value, UUID actor) {
        em.createNativeQuery("""
                INSERT INTO business_settings (setting_key, setting_value, value_type, updated_at, updated_by)
                VALUES (?1, ?2, 'STRING', now(), ?3)
                ON CONFLICT (setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = now(),
                    updated_by = excluded.updated_by""")
                .setParameter(1, key).setParameter(2, value == null ? "" : value).setParameter(3, actor).executeUpdate();
    }

    // ------------------------------------------------------------------ libro de dispensación

    /** Dispensaciones de un periodo (las más recientes primero); {@code antibioticOnly}: solo antibióticos. */
    @Transactional(readOnly = true)
    public PageResponse<DispensationView> book(LocalDate from, LocalDate to, boolean antibioticOnly, String search,
                                               int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 200);
        ZoneId zone = ZoneId.of(settings.current().timezone());
        LocalDate today = LocalDate.now(zone);
        LocalDate start = from == null ? today.minusDays(30) : from;
        LocalDate end = to == null ? today : to;
        if (end.isBefore(start)) {
            throw new BusinessRuleException("La fecha final no puede ser anterior a la inicial.");
        }
        Map<String, Object> params = new HashMap<>();
        params.put("from", Timestamp.from(start.atStartOfDay(zone).toInstant()));
        params.put("to", Timestamp.from(end.plusDays(1).atStartOfDay(zone).toInstant()));
        StringBuilder where = new StringBuilder(" WHERE d.dispensed_at >= :from AND d.dispensed_at < :to");
        if (antibioticOnly) {
            where.append(" AND d.antibiotic");
        }
        if (search != null && !search.isBlank()) {
            where.append(" AND (lower(coalesce(d.patient_name, '')) LIKE :q OR lower(coalesce(d.patient_document, ''))"
                    + " LIKE :q OR lower(coalesce(d.prescriber_name, '')) LIKE :q OR (s.prefix || '-' || s.number) LIKE :qu)");
            String q = search.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
            params.put("q", "%" + q + "%");
            params.put("qu", "%" + q.toUpperCase(Locale.ROOT) + "%");
        }
        String base = " FROM sale_dispensations d JOIN sales s ON s.id = d.sale_id JOIN branches b ON b.id = d.branch_id"
                + where;
        long total = ((Number) query("SELECT count(*)" + base, params).getSingleResult()).longValue();
        List<Object[]> rows = new ArrayList<>();
        for (Object o : query("""
                SELECT d.sale_id, s.prefix || '-' || s.number, d.dispensed_at, b.name, d.dispensed_by, d.antibiotic,
                       d.controlled, d.prescriber_name, d.prescriber_license, d.prescription_date, d.patient_document,
                       d.patient_name, s.status""" + base + " ORDER BY d.dispensed_at DESC LIMIT " + s + " OFFSET "
                + ((long) p * s), params).getResultList()) {
            rows.add((Object[]) o);
        }
        Set<UUID> people = new HashSet<>();
        List<UUID> saleIds = new ArrayList<>();
        rows.forEach(r -> {
            people.add((UUID) r[4]);
            saleIds.add((UUID) r[0]);
        });
        Map<UUID, String> names = members.displayNames(people);
        Map<UUID, List<LineView>> lines = lines(saleIds);
        List<DispensationView> content = new ArrayList<>();
        for (Object[] r : rows) {
            content.add(new DispensationView((UUID) r[0], (String) r[1], instant(r[2]), (String) r[3],
                    names.get((UUID) r[4]), (Boolean) r[5], (Boolean) r[6], (String) r[7], (String) r[8],
                    date(r[9]), (String) r[10], (String) r[11], "VOIDED".equals(r[12]),
                    lines.getOrDefault((UUID) r[0], List.of())));
        }
        return new PageResponse<>(content, p, s, total, (int) ((total + s - 1) / s));
    }

    private Map<UUID, List<LineView>> lines(List<UUID> saleIds) {
        Map<UUID, List<LineView>> result = new LinkedHashMap<>();
        if (saleIds.isEmpty()) {
            return result;
        }
        for (Object o : query("""
                SELECT dl.sale_id, i.name, i.sku, i.quantity, i.unit_code, dl.sale_condition, dl.antibiotic,
                       (SELECT string_agg(DISTINCT l.lot_number, ', ') FROM stock_movements m JOIN lots l ON l.id = m.lot_id
                        WHERE m.reference_type = 'SALE' AND m.reference_id = dl.sale_id AND m.type = 'SALE'
                          AND m.product_id = dl.product_id)
                FROM sale_dispensation_lines dl
                JOIN sale_items i ON i.sale_id = dl.sale_id AND i.line_no = dl.line_no
                WHERE dl.sale_id IN (:ids) ORDER BY dl.sale_id, dl.line_no""", Map.of("ids", saleIds)).getResultList()) {
            Object[] r = (Object[]) o;
            result.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new LineView((String) r[1], (String) r[2],
                    (BigDecimal) r[3], (String) r[4], (String) r[5], (Boolean) r[6], (String) r[7]));
        }
        return result;
    }

    // ------------------------------------------------------------------ apoyo

    private Query query(String sql, Map<String, ?> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        return q;
    }

    private static Map<String, Object> map(TechnicalDirector t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", t.name());
        m.put("profession", t.profession());
        m.put("license", t.license());
        return m;
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static String limit(String v, int max, String field) {
        String t = blank(v);
        if (t != null && t.length() > max) {
            throw new BusinessRuleException("El campo " + field + " admite hasta " + max + " caracteres.");
        }
        return t;
    }

    private static Instant instant(Object v) {
        return v instanceof Timestamp t ? t.toInstant() : (Instant) v;
    }

    private static LocalDate date(Object v) {
        return v == null ? null : v instanceof Date d ? d.toLocalDate() : (LocalDate) v;
    }
}
