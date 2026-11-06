package com.poshibrido.pharmacy.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Calidad de la droguería (Fase 13-6, decisión 287): puntos de control (el local y la nevera) con sus rangos, lecturas
 * de temperatura y humedad dos veces al día (fuera de rango exige anotar qué se hizo; no se cambian ni se borran) y el
 * registro de eventos adversos (el reporte se hace en la página del INVIMA).
 */
@Service
@RequiredArgsConstructor
public class QualityService {

    static final String ALL_BRANCHES = "branches:manage";
    /** Desde esta hora se puede registrar la lectura de la tarde. */
    static final int AFTERNOON_FROM = 12;
    /** Desde esta hora se avisa que falta la lectura de la tarde. */
    static final int AFTERNOON_DUE = 14;
    static final int MAX_POINTS = 10;

    @PersistenceContext
    private EntityManager em;

    private final MemberDirectory members;
    private final AuditLogger audit;
    private final BusinessSettingsApi settings;

    public record BranchOption(UUID id, String name) {
    }

    public record PointView(UUID id, UUID branchId, String name, String kind, BigDecimal tempMin, BigDecimal tempMax,
                            BigDecimal humidityMin, BigDecimal humidityMax, boolean active) {
    }

    public record PointInput(String name, String kind, BigDecimal tempMin, BigDecimal tempMax, BigDecimal humidityMin,
                             BigDecimal humidityMax, Boolean active) {
    }

    public record ReadingView(UUID id, UUID pointId, String pointName, LocalDate date, String shift,
                              BigDecimal temperature, BigDecimal humidity, boolean outOfRange, String actionTaken,
                              String recordedByName, Instant recordedAt) {
    }

    public record PointToday(PointView point, ReadingView morning, ReadingView afternoon) {
    }

    /**
     * Lo de hoy en una sucursal: cada punto con sus dos lecturas, el turno que toca ({@code shift}) y lo que falta
     * ({@code missing}: "Nevera · mañana").
     */
    public record Today(UUID branchId, List<BranchOption> branches, LocalDate date, String shift,
                        boolean afternoonOpen, List<PointToday> points, List<String> missing) {
    }

    public record AdverseEventView(UUID id, long number, UUID branchId, String branchName, LocalDate occurredOn,
                                   String patientName, String patientDocument, Integer patientAge, UUID productId,
                                   String productName, String lotNumber, String description, boolean serious,
                                   LocalDate reportedOn, String invimaReference, String recordedByName,
                                   Instant recordedAt) {
    }

    public record AdverseEventInput(UUID branchId, LocalDate occurredOn, String patientName, String patientDocument,
                                    Integer patientAge, UUID productId, String productName, String lotNumber,
                                    String description, boolean serious, LocalDate reportedOn, String invimaReference) {
    }

    // ------------------------------------------------------------------ sucursales

    @Transactional(readOnly = true)
    public List<BranchOption> branches() {
        Set<UUID> allowed = CurrentActor.permissions().contains(ALL_BRANCHES) ? null
                : members.branchIdsOf(CurrentActor.requireUserId());
        List<BranchOption> result = new ArrayList<>();
        for (Object[] r : rows("SELECT id, name FROM branches WHERE active ORDER BY (code = 'PRINCIPAL') DESC, name",
                Map.of())) {
            if (allowed == null || allowed.contains((UUID) r[0])) {
                result.add(new BranchOption((UUID) r[0], (String) r[1]));
            }
        }
        return result;
    }

    /** La sucursal pedida (si la atiende) o la primera que atiende. */
    UUID resolveBranch(UUID requested) {
        List<BranchOption> options = branches();
        if (requested != null) {
            return options.stream().map(BranchOption::id).filter(requested::equals).findFirst()
                    .orElseThrow(() -> new ForbiddenException("No atiendes esa sucursal."));
        }
        if (options.isEmpty()) {
            throw new ForbiddenException("No atiendes ninguna sucursal.");
        }
        return options.getFirst().id();
    }

    // ------------------------------------------------------------------ puntos de control

    @Transactional(readOnly = true)
    public List<PointView> points(UUID requestedBranch) {
        UUID branchId = resolveBranch(requestedBranch);
        List<PointView> result = new ArrayList<>();
        for (Object[] r : rows("SELECT " + POINT_COLUMNS + " FROM quality_points WHERE branch_id = :b "
                + "ORDER BY active DESC, kind DESC, lower(name)", Map.of("b", branchId))) {
            result.add(point(r));
        }
        return result;
    }

    @Transactional
    public PointView createPoint(UUID requestedBranch, PointInput in) {
        UUID branchId = resolveBranch(requestedBranch);
        if (count("SELECT count(*) FROM quality_points WHERE branch_id = :b", Map.of("b", branchId)) >= MAX_POINTS) {
            throw new BusinessRuleException("Máximo " + MAX_POINTS + " puntos de control por sucursal.");
        }
        Checked c = check(in, branchId, null);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        UUID actor = CurrentActor.requireUserId();
        em.createNativeQuery("""
                INSERT INTO quality_points (id, branch_id, name, kind, temp_min, temp_max, humidity_min, humidity_max,
                                            active, created_at, created_by, updated_at, updated_by, version)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, TRUE, ?9, ?10, ?9, ?10, 0)""")
                .setParameter(1, id).setParameter(2, branchId).setParameter(3, c.name()).setParameter(4, c.kind())
                .setParameter(5, c.tempMin()).setParameter(6, c.tempMax()).setParameter(7, c.humidityMin())
                .setParameter(8, c.humidityMax()).setParameter(9, now).setParameter(10, actor).executeUpdate();
        PointView view = pointById(id);
        audit.log("QUALITY_POINT_CREATED", "quality_point", id, null, pointData(view));
        return view;
    }

    @Transactional
    public PointView updatePoint(UUID id, PointInput in) {
        PointView before = pointById(id);
        resolveBranch(before.branchId());
        Checked c = check(new PointInput(in.name(), before.kind(), in.tempMin(), in.tempMax(), in.humidityMin(),
                in.humidityMax(), in.active()), before.branchId(), id);
        boolean active = in.active() == null ? before.active() : in.active();
        em.createNativeQuery("""
                UPDATE quality_points SET name = ?2, temp_min = ?3, temp_max = ?4, humidity_min = ?5, humidity_max = ?6,
                       active = ?7, updated_at = ?8, updated_by = ?9, version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, c.name()).setParameter(3, c.tempMin()).setParameter(4, c.tempMax())
                .setParameter(5, c.humidityMin()).setParameter(6, c.humidityMax()).setParameter(7, active)
                .setParameter(8, Instant.now()).setParameter(9, CurrentActor.requireUserId()).executeUpdate();
        PointView after = pointById(id);
        audit.log("QUALITY_POINT_UPDATED", "quality_point", id, pointData(before), pointData(after));
        return after;
    }

    private record Checked(String name, String kind, BigDecimal tempMin, BigDecimal tempMax, BigDecimal humidityMin,
                           BigDecimal humidityMax) {
    }

    private Checked check(PointInput in, UUID branchId, UUID except) {
        String name = in.name() == null ? "" : in.name().trim();
        if (name.isEmpty() || name.length() > 60) {
            throw new BusinessRuleException("Escribe el nombre del punto (por ejemplo Local o Nevera), de hasta 60 letras.");
        }
        String kind = in.kind();
        if (!"ROOM".equals(kind) && !"FRIDGE".equals(kind)) {
            throw new BusinessRuleException("Elige si es el local o una nevera.");
        }
        BigDecimal tMin = scale(in.tempMin());
        BigDecimal tMax = scale(in.tempMax());
        if (tMin == null || tMax == null || tMin.compareTo(tMax) >= 0
                || tMin.compareTo(new BigDecimal("-30")) < 0 || tMax.compareTo(new BigDecimal("60")) > 0) {
            throw new BusinessRuleException("La temperatura mínima debe ser menor que la máxima (entre -30 y 60 °C).");
        }
        BigDecimal hMin = scale(in.humidityMin());
        BigDecimal hMax = scale(in.humidityMax());
        if ("FRIDGE".equals(kind)) {
            hMin = null;
            hMax = null;
        } else if (hMin == null || hMax == null || hMin.signum() < 0 || hMax.compareTo(new BigDecimal("100")) > 0
                || hMin.compareTo(hMax) >= 0) {
            throw new BusinessRuleException("La humedad mínima debe ser menor que la máxima (entre 0 y 100 %).");
        }
        Map<String, Object> p = new HashMap<>();
        p.put("b", branchId);
        p.put("n", name);
        p.put("x", except == null ? Ids.newId() : except);
        if (count("SELECT count(*) FROM quality_points WHERE branch_id = :b AND lower(name) = lower(:n) AND id <> :x", p) > 0) {
            throw new ConflictException("Ya hay un punto llamado " + name + " en esta sucursal.");
        }
        return new Checked(name, kind, tMin, tMax, hMin, hMax);
    }

    // ------------------------------------------------------------------ lecturas

    @Transactional(readOnly = true)
    public Today today(UUID requestedBranch) {
        UUID branchId = resolveBranch(requestedBranch);
        ZoneId zone = zone();
        LocalDateTime now = LocalDateTime.now(zone);
        LocalDate date = now.toLocalDate();
        boolean afternoonOpen = now.getHour() >= AFTERNOON_FROM;
        boolean afternoonDue = now.getHour() >= AFTERNOON_DUE;
        Map<UUID, ReadingView[]> byPoint = new HashMap<>();
        for (ReadingView r : readings(branchId, date, date)) {
            ReadingView[] pair = byPoint.computeIfAbsent(r.pointId(), k -> new ReadingView[2]);
            pair["MORNING".equals(r.shift()) ? 0 : 1] = r;
        }
        List<PointToday> points = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (PointView p : points(branchId)) {
            if (!p.active()) {
                continue;
            }
            ReadingView[] pair = byPoint.getOrDefault(p.id(), new ReadingView[2]);
            points.add(new PointToday(p, pair[0], pair[1]));
            if (pair[0] == null) {
                missing.add(p.name() + " · mañana");
            }
            if (afternoonDue && pair[1] == null) {
                missing.add(p.name() + " · tarde");
            }
        }
        return new Today(branchId, branches(), date, afternoonOpen ? "AFTERNOON" : "MORNING", afternoonOpen, points,
                missing);
    }

    /** Lectura del turno de hoy. Fuera de rango exige {@code actionTaken}; no se repite ni se cambia. */
    @Transactional
    public ReadingView record(UUID pointId, String shift, BigDecimal temperature, BigDecimal humidity,
                              String actionTaken) {
        PointView p = pointById(pointId);
        resolveBranch(p.branchId());
        if (!p.active()) {
            throw new BusinessRuleException("El punto " + p.name() + " está inactivo.");
        }
        if (!"MORNING".equals(shift) && !"AFTERNOON".equals(shift)) {
            throw new BusinessRuleException("Elige si es la lectura de la mañana o de la tarde.");
        }
        LocalDateTime now = LocalDateTime.now(zone());
        if ("AFTERNOON".equals(shift) && now.getHour() < AFTERNOON_FROM) {
            throw new BusinessRuleException("La lectura de la tarde se registra desde las 12 del día.");
        }
        BigDecimal temp = scale(temperature);
        if (temp == null || temp.compareTo(new BigDecimal("-30")) < 0 || temp.compareTo(new BigDecimal("60")) > 0) {
            throw new BusinessRuleException("Escribe la temperatura que marca el termómetro (entre -30 y 60 °C).");
        }
        BigDecimal hum = scale(humidity);
        if ("ROOM".equals(p.kind())) {
            if (hum == null || hum.signum() < 0 || hum.compareTo(new BigDecimal("100")) > 0) {
                throw new BusinessRuleException("Escribe la humedad que marca el termohigrómetro (de 0 a 100 %).");
            }
        } else {
            hum = null;
        }
        boolean out = temp.compareTo(p.tempMin()) < 0 || temp.compareTo(p.tempMax()) > 0
                || (hum != null && p.humidityMin() != null
                && (hum.compareTo(p.humidityMin()) < 0 || hum.compareTo(p.humidityMax()) > 0));
        String action = actionTaken == null || actionTaken.isBlank() ? null : actionTaken.trim();
        if (action != null && action.length() > 300) {
            throw new BusinessRuleException("Lo que se hizo admite hasta 300 caracteres.");
        }
        if (out && action == null) {
            throw new BusinessRuleException("La lectura está fuera del rango: escribe qué se hizo (por ejemplo, se "
                    + "prendió el aire o se revisó la nevera).");
        }
        LocalDate date = now.toLocalDate();
        if (count("SELECT count(*) FROM quality_readings WHERE point_id = :p AND reading_date = :d AND shift = :s",
                Map.of("p", pointId, "d", date, "s", shift)) > 0) {
            throw new ConflictException("Ya se registró la lectura de la " + ("MORNING".equals(shift) ? "mañana" : "tarde")
                    + " de " + p.name() + ". Si hubo un error, acláralo en la lectura siguiente.");
        }
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO quality_readings (id, point_id, branch_id, reading_date, shift, temperature, humidity,
                                              temp_min, temp_max, humidity_min, humidity_max, out_of_range,
                                              action_taken, recorded_by, recorded_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)""")
                .setParameter(1, id).setParameter(2, pointId).setParameter(3, p.branchId()).setParameter(4, date)
                .setParameter(5, shift).setParameter(6, temp).setParameter(7, hum).setParameter(8, p.tempMin())
                .setParameter(9, p.tempMax()).setParameter(10, p.humidityMin()).setParameter(11, p.humidityMax())
                .setParameter(12, out).setParameter(13, action).setParameter(14, CurrentActor.requireUserId())
                .setParameter(15, Instant.now()).executeUpdate();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("point", p.name());
        data.put("shift", shift);
        data.put("temperature", temp);
        data.put("humidity", hum);
        data.put("outOfRange", out);
        data.put("actionTaken", action);
        audit.log("QUALITY_READING_RECORDED", "quality_reading", id, null, data);
        return readings(p.branchId(), date, date).stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
    }

    /** Lecturas de un periodo (para la planilla del mes y el informe). */
    @Transactional(readOnly = true)
    public List<ReadingView> readings(UUID requestedBranch, LocalDate from, LocalDate to) {
        UUID branchId = resolveBranch(requestedBranch);
        LocalDate end = to == null ? LocalDate.now(zone()) : to;
        LocalDate start = from == null ? end.withDayOfMonth(1) : from;
        if (end.isBefore(start) || start.plusDays(400).isBefore(end)) {
            throw new BusinessRuleException("Elige un periodo de hasta un año, con la fecha final después de la inicial.");
        }
        List<Object[]> found = rows("""
                SELECT r.id, r.point_id, p.name, r.reading_date, r.shift, r.temperature, r.humidity, r.out_of_range,
                       r.action_taken, r.recorded_by, r.recorded_at
                FROM quality_readings r JOIN quality_points p ON p.id = r.point_id
                WHERE r.branch_id = :b AND r.reading_date BETWEEN :f AND :t
                ORDER BY r.reading_date, r.shift DESC, p.kind DESC, lower(p.name)""",
                Map.of("b", branchId, "f", start, "t", end));
        Set<UUID> people = new HashSet<>();
        found.forEach(r -> people.add((UUID) r[9]));
        Map<UUID, String> names = members.displayNames(people);
        List<ReadingView> result = new ArrayList<>();
        for (Object[] r : found) {
            result.add(new ReadingView((UUID) r[0], (UUID) r[1], (String) r[2], date(r[3]), (String) r[4],
                    (BigDecimal) r[5], (BigDecimal) r[6], (Boolean) r[7], (String) r[8], names.get((UUID) r[9]),
                    instant(r[10])));
        }
        return result;
    }

    // ------------------------------------------------------------------ eventos adversos

    @Transactional(readOnly = true)
    public List<AdverseEventView> adverseEvents(UUID requestedBranch, LocalDate from, LocalDate to) {
        UUID branchId = resolveBranch(requestedBranch);
        LocalDate end = to == null ? LocalDate.now(zone()) : to;
        LocalDate start = from == null ? end.minusYears(1) : from;
        return events("WHERE e.branch_id = :b AND e.occurred_on BETWEEN :f AND :t",
                Map.of("b", branchId, "f", start, "t", end));
    }

    @Transactional
    public AdverseEventView createAdverseEvent(AdverseEventInput in) {
        UUID branchId = resolveBranch(in.branchId());
        Event e = checkEvent(in);
        UUID id = Ids.newId();
        long number = ((Number) em.createNativeQuery("SELECT nextval('adverse_event_seq')").getSingleResult()).longValue();
        Instant now = Instant.now();
        UUID actor = CurrentActor.requireUserId();
        em.createNativeQuery("""
                INSERT INTO adverse_events (id, number, branch_id, occurred_on, patient_name, patient_document,
                                            patient_age, product_id, product_name, lot_number, description, serious,
                                            reported_on, invima_reference, recorded_by, recorded_at, updated_at,
                                            updated_by, version)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?15, 0)""")
                .setParameter(1, id).setParameter(2, number).setParameter(3, branchId).setParameter(4, in.occurredOn())
                .setParameter(5, e.patientName()).setParameter(6, e.patientDocument()).setParameter(7, in.patientAge())
                .setParameter(8, e.productId()).setParameter(9, e.productName()).setParameter(10, e.lotNumber())
                .setParameter(11, e.description()).setParameter(12, in.serious()).setParameter(13, in.reportedOn())
                .setParameter(14, e.invimaReference()).setParameter(15, actor).setParameter(16, now).executeUpdate();
        AdverseEventView view = event(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("number", number);
        data.put("product", view.productName());
        data.put("serious", view.serious());
        data.put("reportedOn", view.reportedOn());
        audit.log("ADVERSE_EVENT_RECORDED", "adverse_event", id, null, data);
        return view;
    }

    /** Anotar (o corregir) cuándo se reportó al INVIMA y con qué número. */
    @Transactional
    public AdverseEventView reportAdverseEvent(UUID id, LocalDate reportedOn, String invimaReference) {
        AdverseEventView before = event(id);
        resolveBranch(before.branchId());
        LocalDate today = LocalDate.now(zone());
        if (reportedOn == null || reportedOn.isAfter(today) || reportedOn.isBefore(before.occurredOn())) {
            throw new BusinessRuleException("La fecha del reporte va entre la del evento y hoy.");
        }
        String reference = text(invimaReference, 60, "número del reporte");
        em.createNativeQuery("""
                UPDATE adverse_events SET reported_on = ?2, invima_reference = ?3, updated_at = ?4, updated_by = ?5,
                       version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, reportedOn).setParameter(3, reference)
                .setParameter(4, Instant.now()).setParameter(5, CurrentActor.requireUserId()).executeUpdate();
        AdverseEventView after = event(id);
        Map<String, Object> from = new LinkedHashMap<>();
        from.put("reportedOn", before.reportedOn());
        from.put("invimaReference", before.invimaReference());
        Map<String, Object> to = new LinkedHashMap<>();
        to.put("reportedOn", after.reportedOn());
        to.put("invimaReference", after.invimaReference());
        audit.log("ADVERSE_EVENT_REPORTED", "adverse_event", id, from, to);
        return after;
    }

    private record Event(String patientName, String patientDocument, UUID productId, String productName,
                         String lotNumber, String description, String invimaReference) {
    }

    private Event checkEvent(AdverseEventInput in) {
        LocalDate today = LocalDate.now(zone());
        if (in.occurredOn() == null || in.occurredOn().isAfter(today) || in.occurredOn().isBefore(today.minusYears(2))) {
            throw new BusinessRuleException("Escribe la fecha en que pasó (hasta hoy).");
        }
        String patient = text(in.patientName(), 160, "paciente");
        if (patient == null) {
            throw new BusinessRuleException("Escribe el nombre del paciente.");
        }
        if (in.patientAge() != null && (in.patientAge() < 0 || in.patientAge() > 130)) {
            throw new BusinessRuleException("La edad no es válida.");
        }
        String productName = text(in.productName(), 200, "medicamento");
        UUID productId = in.productId();
        if (productId != null) {
            List<Object[]> found = rows("SELECT id, name FROM products WHERE id = :p", Map.of("p", productId));
            if (found.isEmpty()) {
                throw new NotFoundException("Producto no encontrado.");
            }
            productName = (String) found.getFirst()[1];
        }
        if (productName == null) {
            throw new BusinessRuleException("Escribe el medicamento que lo causó.");
        }
        String description = text(in.description(), 1000, "qué pasó");
        if (description == null) {
            throw new BusinessRuleException("Describe qué le pasó al paciente.");
        }
        if (in.reportedOn() != null && (in.reportedOn().isAfter(today) || in.reportedOn().isBefore(in.occurredOn()))) {
            throw new BusinessRuleException("La fecha del reporte va entre la del evento y hoy.");
        }
        return new Event(patient, text(in.patientDocument(), 20, "documento"), productId, productName,
                text(in.lotNumber(), 40, "lote"), description, text(in.invimaReference(), 60, "número del reporte"));
    }

    private AdverseEventView event(UUID id) {
        List<AdverseEventView> found = events("WHERE e.id = :id", Map.of("id", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Evento adverso no encontrado.");
        }
        return found.getFirst();
    }

    private List<AdverseEventView> events(String where, Map<String, ?> params) {
        List<Object[]> found = rows("""
                SELECT e.id, e.number, e.branch_id, b.name, e.occurred_on, e.patient_name, e.patient_document,
                       e.patient_age, e.product_id, e.product_name, e.lot_number, e.description, e.serious,
                       e.reported_on, e.invima_reference, e.recorded_by, e.recorded_at
                FROM adverse_events e JOIN branches b ON b.id = e.branch_id""" + " " + where
                + " ORDER BY e.occurred_on DESC, e.number DESC", params);
        Set<UUID> people = new HashSet<>();
        found.forEach(r -> people.add((UUID) r[15]));
        Map<UUID, String> names = members.displayNames(people);
        List<AdverseEventView> result = new ArrayList<>();
        for (Object[] r : found) {
            result.add(new AdverseEventView((UUID) r[0], ((Number) r[1]).longValue(), (UUID) r[2], (String) r[3],
                    date(r[4]), (String) r[5], (String) r[6], r[7] == null ? null : ((Number) r[7]).intValue(),
                    (UUID) r[8], (String) r[9], (String) r[10], (String) r[11], (Boolean) r[12], date(r[13]),
                    (String) r[14], names.get((UUID) r[15]), instant(r[16])));
        }
        return result;
    }

    // ------------------------------------------------------------------ apoyo

    private static final String POINT_COLUMNS =
            "id, branch_id, name, kind, temp_min, temp_max, humidity_min, humidity_max, active";

    PointView pointById(UUID id) {
        List<Object[]> found = rows("SELECT " + POINT_COLUMNS + " FROM quality_points WHERE id = :id", Map.of("id", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Punto de control no encontrado.");
        }
        return point(found.getFirst());
    }

    private static PointView point(Object[] r) {
        return new PointView((UUID) r[0], (UUID) r[1], (String) r[2], (String) r[3], (BigDecimal) r[4],
                (BigDecimal) r[5], (BigDecimal) r[6], (BigDecimal) r[7], (Boolean) r[8]);
    }

    private static Map<String, Object> pointData(PointView p) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", p.name());
        m.put("kind", p.kind());
        m.put("tempMin", p.tempMin());
        m.put("tempMax", p.tempMax());
        m.put("humidityMin", p.humidityMin());
        m.put("humidityMax", p.humidityMax());
        m.put("active", p.active());
        return m;
    }

    ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? null : v.setScale(1, RoundingMode.HALF_UP);
    }

    private static String text(String v, int max, String field) {
        if (v == null || v.isBlank()) {
            return null;
        }
        String t = v.trim();
        if (t.length() > max) {
            throw new BusinessRuleException("El campo " + field + " admite hasta " + max + " caracteres.");
        }
        return t;
    }

    @SuppressWarnings("unchecked")
    List<Object[]> rows(String sql, Map<String, ?> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        List<Object[]> result = new ArrayList<>();
        for (Object o : q.getResultList()) {
            result.add(o instanceof Object[] a ? a : new Object[]{o});
        }
        return result;
    }

    private long count(String sql, Map<String, ?> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        return ((Number) q.getSingleResult()).longValue();
    }

    static Instant instant(Object v) {
        return v instanceof Timestamp t ? t.toInstant() : (Instant) v;
    }

    static LocalDate date(Object v) {
        return v == null ? null : v instanceof Date d ? d.toLocalDate() : (LocalDate) v;
    }
}
