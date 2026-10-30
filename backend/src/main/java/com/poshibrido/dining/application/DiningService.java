package com.poshibrido.dining.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.dining.application.DiningViews.BranchOption;
import com.poshibrido.dining.application.DiningViews.Floor;
import com.poshibrido.dining.application.DiningViews.FloorTable;
import com.poshibrido.dining.application.DiningViews.FloorZone;
import com.poshibrido.dining.application.DiningViews.TabSummary;
import com.poshibrido.dining.application.DiningViews.TableView;
import com.poshibrido.dining.application.DiningViews.ZoneView;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Zonas y mesas de cada sucursal y el "salón" con las cuentas abiertas (Fase 12b-2, decisión 269). Todo el equipo de
 * la sucursal ve todas las mesas (decisión del usuario); quien tiene {@code branches:manage} ve todas las sucursales.
 */
@Service
@RequiredArgsConstructor
public class DiningService {

    static final String ALL_BRANCHES = "branches:manage";
    static final int MAX_ZONES = 30;
    static final int MAX_TABLES = 200;

    private final MemberDirectory members;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    // ------------------------------------------------------------------ sucursales

    /** Sucursales activas que el usuario puede atender, la principal primero. */
    @Transactional(readOnly = true)
    public List<BranchOption> branches() {
        Set<UUID> allowed = CurrentActor.permissions().contains(ALL_BRANCHES) ? null
                : members.branchIdsOf(CurrentActor.requireUserId());
        List<BranchOption> result = new ArrayList<>();
        for (Object[] r : rows("SELECT id, name FROM branches WHERE active ORDER BY (code = 'PRINCIPAL') DESC, name", Map.of())) {
            if (allowed == null || allowed.contains((UUID) r[0])) {
                result.add(new BranchOption((UUID) r[0], (String) r[1]));
            }
        }
        return result;
    }

    /** La sucursal pedida (si la puede atender) o la primera que puede; 403 si no atiende ninguna. */
    UUID resolveBranch(UUID requested) {
        List<BranchOption> options = branches();
        if (requested != null) {
            return options.stream().map(BranchOption::id).filter(requested::equals).findFirst()
                    .orElseThrow(() -> new ForbiddenException("No atiendes esa sucursal."));
        }
        return options.stream().map(BranchOption::id).findFirst()
                .orElseThrow(() -> new ForbiddenException("No tienes una sucursal asignada."));
    }

    /** 403 si el usuario no atiende la sucursal. */
    void requireBranch(UUID branchId) {
        resolveBranch(branchId);
    }

    // ------------------------------------------------------------------ salón

    @Transactional(readOnly = true)
    public Floor floor(UUID requestedBranch) {
        List<BranchOption> options = branches();
        UUID branchId = resolveBranch(requestedBranch);
        Map<UUID, TabSummary> byTable = new LinkedHashMap<>();
        List<TabSummary> others = new ArrayList<>();
        for (TabSummary tab : openTabs(branchId)) {
            if (tab.tableId() != null) {
                byTable.put(tab.tableId(), tab);
            } else {
                others.add(tab);
            }
        }
        Map<UUID, List<FloorTable>> tables = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT t.zone_id, t.id, t.name, t.seats FROM dining_tables t
                WHERE t.branch_id = :b AND t.active ORDER BY t.position, lower(t.name)""", Map.of("b", branchId))) {
            UUID tableId = (UUID) r[1];
            tables.computeIfAbsent((UUID) r[0], k -> new ArrayList<>())
                    .add(new FloorTable(tableId, (String) r[2], Rows.integer(r[3]), byTable.get(tableId)));
        }
        List<FloorZone> zones = new ArrayList<>();
        for (Object[] r : rows("""
                SELECT id, name FROM dining_zones WHERE branch_id = :b AND active ORDER BY position, lower(name)""",
                Map.of("b", branchId))) {
            zones.add(new FloorZone((UUID) r[0], (String) r[1], tables.getOrDefault((UUID) r[0], List.of())));
        }
        return new Floor(branchId, options, zones, others);
    }

    /**
     * Cuentas abiertas de la sucursal con su total (precios del momento de agregar), cantidad de productos y comandas
     * listas para llevar a la mesa (Fase 12b-4).
     */
    private List<TabSummary> openTabs(UUID branchId) {
        List<Object[]> data = rows("""
                SELECT t.id, t.number, t.kind, t.table_id, dt.name, t.opened_at, t.guests, t.customer_name, t.opened_by,
                       coalesce(sum(i.quantity * i.unit_price) FILTER (WHERE i.voided_at IS NULL), 0),
                       coalesce(sum(i.quantity) FILTER (WHERE i.voided_at IS NULL), 0),
                       (SELECT count(DISTINCT k.id) FROM kitchen_tickets k JOIN tab_items ki ON ki.ticket_id = k.id
                        WHERE ki.tab_id = t.id AND k.status = 'READY')
                FROM tabs t
                LEFT JOIN dining_tables dt ON dt.id = t.table_id
                LEFT JOIN tab_items i ON i.tab_id = t.id
                WHERE t.branch_id = :b AND t.status = 'OPEN'
                GROUP BY t.id, dt.name
                ORDER BY t.opened_at""", Map.of("b", branchId));
        Set<UUID> people = new HashSet<>();
        data.forEach(r -> people.add((UUID) r[8]));
        Map<UUID, String> names = members.displayNames(people);
        List<TabSummary> result = new ArrayList<>();
        for (Object[] r : data) {
            String kind = (String) r[2];
            long number = ((Number) r[1]).longValue();
            result.add(new TabSummary((UUID) r[0], number, kind,
                    TabLabels.label(kind, number, (String) r[4], (String) r[7]), (UUID) r[3], Rows.instant(r[5]),
                    Rows.integer(r[6]), (String) r[7], money(r[9]), ((Number) r[10]).intValue(), names.get((UUID) r[8]),
                    ((Number) r[11]).intValue()));
        }
        return result;
    }

    // ------------------------------------------------------------------ configuración

    @Transactional(readOnly = true)
    public List<ZoneView> zones(UUID requestedBranch) {
        UUID branchId = resolveBranch(requestedBranch);
        Map<UUID, List<TableView>> tables = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT id, zone_id, name, seats, position, active FROM dining_tables WHERE branch_id = :b
                ORDER BY position, lower(name)""", Map.of("b", branchId))) {
            tables.computeIfAbsent((UUID) r[1], k -> new ArrayList<>()).add(new TableView((UUID) r[0], (UUID) r[1],
                    (String) r[2], Rows.integer(r[3]), ((Number) r[4]).intValue(), (Boolean) r[5]));
        }
        List<ZoneView> result = new ArrayList<>();
        for (Object[] r : rows("""
                SELECT id, name, position, active FROM dining_zones WHERE branch_id = :b
                ORDER BY position, lower(name)""", Map.of("b", branchId))) {
            UUID id = (UUID) r[0];
            result.add(new ZoneView(id, branchId, (String) r[1], ((Number) r[2]).intValue(), (Boolean) r[3],
                    tables.getOrDefault(id, List.of())));
        }
        return result;
    }

    @Transactional
    public ZoneView createZone(UUID branchId, String rawName) {
        requireBranch(branchId);
        String name = clean(rawName, 40, "la zona");
        long count = count("SELECT count(*) FROM dining_zones WHERE branch_id = :b", Map.of("b", branchId));
        if (count >= MAX_ZONES) {
            throw new BusinessRuleException("Máximo " + MAX_ZONES + " zonas por sucursal.");
        }
        requireUniqueZone(branchId, name, null);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        em.createNativeQuery("""
                INSERT INTO dining_zones (id, branch_id, name, position, active, created_at, created_by, updated_at,
                                          updated_by, version)
                VALUES (?1, ?2, ?3, ?4, TRUE, ?5, ?6, ?5, ?6, 0)""")
                .setParameter(1, id).setParameter(2, branchId).setParameter(3, name).setParameter(4, (int) count)
                .setParameter(5, now).setParameter(6, CurrentActor.requireUserId()).executeUpdate();
        audit.log("DINING_ZONE_CREATED", "dining_zone", id, null, Map.of("name", name));
        return zone(id);
    }

    @Transactional
    public ZoneView updateZone(UUID id, String rawName, Integer position, boolean active) {
        ZoneView before = zone(id);
        requireBranch(before.branchId());
        String name = clean(rawName, 40, "la zona");
        requireUniqueZone(before.branchId(), name, id);
        if (!active && before.active() && count("""
                SELECT count(*) FROM tabs t JOIN dining_tables dt ON dt.id = t.table_id
                WHERE dt.zone_id = :z AND t.status = 'OPEN'""", Map.of("z", id)) > 0) {
            throw new ConflictException("La zona " + before.name() + " tiene cuentas abiertas: cóbralas o muévelas antes.");
        }
        em.createNativeQuery("""
                UPDATE dining_zones SET name = ?2, position = ?3, active = ?4, updated_at = ?5, updated_by = ?6,
                       version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, name)
                .setParameter(3, position == null ? before.position() : position).setParameter(4, active)
                .setParameter(5, Instant.now()).setParameter(6, CurrentActor.requireUserId()).executeUpdate();
        ZoneView after = zone(id);
        audit.log("DINING_ZONE_UPDATED", "dining_zone", id, zoneData(before), zoneData(after));
        return after;
    }

    @Transactional
    public TableView createTable(UUID zoneId, String rawName, Integer seats) {
        ZoneView zone = zone(zoneId);
        requireBranch(zone.branchId());
        String name = clean(rawName, 20, "la mesa");
        requireSeats(seats);
        if (count("SELECT count(*) FROM dining_tables WHERE branch_id = :b", Map.of("b", zone.branchId())) >= MAX_TABLES) {
            throw new BusinessRuleException("Máximo " + MAX_TABLES + " mesas por sucursal.");
        }
        requireUniqueTable(zone.branchId(), name, null);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        em.createNativeQuery("""
                INSERT INTO dining_tables (id, branch_id, zone_id, name, seats, position, active, created_at, created_by,
                                           updated_at, updated_by, version)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, TRUE, ?7, ?8, ?7, ?8, 0)""")
                .setParameter(1, id).setParameter(2, zone.branchId()).setParameter(3, zoneId).setParameter(4, name)
                .setParameter(5, seats).setParameter(6, zone.tables().size()).setParameter(7, now)
                .setParameter(8, CurrentActor.requireUserId()).executeUpdate();
        TableView view = table(id);
        audit.log("DINING_TABLE_CREATED", "dining_table", id, null, tableData(view, zone.name()));
        return view;
    }

    @Transactional
    public TableView updateTable(UUID id, UUID zoneId, String rawName, Integer seats, Integer position, boolean active) {
        TableView before = table(id);
        ZoneView fromZone = zone(before.zoneId());
        requireBranch(fromZone.branchId());
        ZoneView toZone = zoneId == null ? fromZone : zone(zoneId);
        if (!toZone.branchId().equals(fromZone.branchId())) {
            throw new BusinessRuleException("La mesa solo se mueve a otra zona de la misma sucursal.");
        }
        String name = clean(rawName, 20, "la mesa");
        requireSeats(seats);
        requireUniqueTable(fromZone.branchId(), name, id);
        if (!active && before.active() && count("SELECT count(*) FROM tabs WHERE table_id = :t AND status = 'OPEN'",
                Map.of("t", id)) > 0) {
            throw new ConflictException("La mesa " + before.name() + " tiene una cuenta abierta: cóbrala o muévela antes.");
        }
        em.createNativeQuery("""
                UPDATE dining_tables SET zone_id = ?2, name = ?3, seats = ?4, position = ?5, active = ?6, updated_at = ?7,
                       updated_by = ?8, version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, toZone.id()).setParameter(3, name).setParameter(4, seats)
                .setParameter(5, position == null ? before.position() : position).setParameter(6, active)
                .setParameter(7, Instant.now()).setParameter(8, CurrentActor.requireUserId()).executeUpdate();
        TableView after = table(id);
        audit.log("DINING_TABLE_UPDATED", "dining_table", id, tableData(before, fromZone.name()),
                tableData(after, toZone.name()));
        return after;
    }

    // ------------------------------------------------------------------ apoyo

    ZoneView zone(UUID id) {
        List<Object[]> found = rows("SELECT id, branch_id, name, position, active FROM dining_zones WHERE id = :z",
                Map.of("z", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Zona no encontrada.");
        }
        Object[] r = found.getFirst();
        List<TableView> tables = new ArrayList<>();
        for (Object[] t : rows("""
                SELECT id, zone_id, name, seats, position, active FROM dining_tables WHERE zone_id = :z
                ORDER BY position, lower(name)""", Map.of("z", id))) {
            tables.add(new TableView((UUID) t[0], (UUID) t[1], (String) t[2], Rows.integer(t[3]), ((Number) t[4]).intValue(),
                    (Boolean) t[5]));
        }
        return new ZoneView((UUID) r[0], (UUID) r[1], (String) r[2], ((Number) r[3]).intValue(), (Boolean) r[4], tables);
    }

    TableView table(UUID id) {
        List<Object[]> found = rows("SELECT id, zone_id, name, seats, position, active FROM dining_tables WHERE id = :t",
                Map.of("t", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Mesa no encontrada.");
        }
        Object[] t = found.getFirst();
        return new TableView((UUID) t[0], (UUID) t[1], (String) t[2], Rows.integer(t[3]), ((Number) t[4]).intValue(),
                (Boolean) t[5]);
    }

    private void requireUniqueZone(UUID branchId, String name, UUID except) {
        if (count("SELECT count(*) FROM dining_zones WHERE branch_id = :b AND lower(name) = lower(:n)"
                + (except == null ? "" : " AND id <> :x"), params(branchId, name, except)) > 0) {
            throw new ConflictException("Ya hay una zona llamada " + name + " en esta sucursal.");
        }
    }

    private void requireUniqueTable(UUID branchId, String name, UUID except) {
        if (count("SELECT count(*) FROM dining_tables WHERE branch_id = :b AND lower(name) = lower(:n)"
                + (except == null ? "" : " AND id <> :x"), params(branchId, name, except)) > 0) {
            throw new ConflictException("Ya hay una mesa llamada " + name + " en esta sucursal.");
        }
    }

    private static Map<String, Object> params(UUID branchId, String name, UUID except) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("b", branchId);
        p.put("n", name);
        if (except != null) {
            p.put("x", except);
        }
        return p;
    }

    private static void requireSeats(Integer seats) {
        if (seats != null && (seats < 1 || seats > 99)) {
            throw new BusinessRuleException("Los puestos de la mesa van de 1 a 99.");
        }
    }

    static String clean(String raw, int max, String what) {
        String value = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (value.isEmpty()) {
            throw new BusinessRuleException("Escribe el nombre de " + what + ".");
        }
        if (value.length() > max) {
            throw new BusinessRuleException("El nombre de " + what + " admite hasta " + max + " caracteres.");
        }
        return value;
    }

    private static Map<String, Object> zoneData(ZoneView z) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", z.name());
        data.put("position", z.position());
        data.put("active", z.active());
        return data;
    }

    private static Map<String, Object> tableData(TableView t, String zoneName) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", t.name());
        data.put("zone", zoneName);
        data.put("seats", t.seats());
        data.put("active", t.active());
        return data;
    }

    private long count(String sql, Map<String, Object> params) {
        var query = em.createNativeQuery(sql);
        params.forEach(query::setParameter);
        return ((Number) query.getSingleResult()).longValue();
    }

    @SuppressWarnings("unchecked")
    List<Object[]> rows(String sql, Map<String, Object> params) {
        var query = em.createNativeQuery(sql);
        params.forEach(query::setParameter);
        return query.getResultList();
    }

    static BigDecimal money(Object value) {
        return ((BigDecimal) value).setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
