package com.poshibrido.dining.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.dining.application.KitchenViews.Ref;
import com.poshibrido.dining.application.KitchenViews.StationView;
import com.poshibrido.dining.application.KitchenViews.TicketItem;
import com.poshibrido.dining.application.KitchenViews.TicketModifier;
import com.poshibrido.dining.application.KitchenViews.TicketSummary;
import com.poshibrido.dining.application.KitchenViews.TicketView;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Cocina y comandas (Fase 12b-3, decisión 270).
 * <ul>
 *   <li>Estaciones (Cocina, Bar…): cada producto va a la estación que tenga asignada él mismo, si no a la de su
 *       categoría y si no a la principal ("Cocina", que siempre existe y no se desactiva).</li>
 *   <li>Enviar: lo pedido en una cuenta sale en una comanda por estación; la línea queda "en cocina" (y quitarla ya
 *       necesita {@code tables:void}).</li>
 *   <li>Imprimir: la primera impresión la reclama un solo equipo (dos impresoras configuradas para la misma estación no
 *       sacan la comanda dos veces); reimprimir queda en la auditoría.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class KitchenService {

    static final int MAX_STATIONS = 10;
    static final int MAX_ASSIGNED = 500;
    /** Una impresora que se prende no saca comandas de hace más de esto. */
    static final Duration AUTO_PRINT_WINDOW = Duration.ofHours(2);
    static final Duration RECENT_WINDOW = Duration.ofHours(12);
    static final int MAX_TICKETS = 80;

    private final DiningService dining;
    private final MemberDirectory members;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record StationInput(String name, boolean main, boolean active, Integer position, List<UUID> categoryIds,
                               List<UUID> productIds) {
    }

    // ------------------------------------------------------------------ estaciones

    @Transactional(readOnly = true)
    public List<StationView> stations() {
        Map<UUID, List<Ref>> categories = refs("""
                SELECT s.station_id, c.id, c.name FROM kitchen_station_categories s
                JOIN categories c ON c.id = s.category_id ORDER BY s.station_id, lower(c.name)""");
        Map<UUID, List<Ref>> products = refs("""
                SELECT s.station_id, p.id, p.name FROM kitchen_station_products s
                JOIN products p ON p.id = s.product_id ORDER BY s.station_id, lower(p.name)""");
        List<StationView> result = new ArrayList<>();
        for (Object[] r : dining.rows("""
                SELECT id, name, is_main, position, active FROM kitchen_stations
                ORDER BY is_main DESC, active DESC, position, lower(name)""", Map.of())) {
            UUID id = (UUID) r[0];
            result.add(new StationView(id, (String) r[1], (Boolean) r[2], ((Number) r[3]).intValue(), (Boolean) r[4],
                    categories.getOrDefault(id, List.of()), products.getOrDefault(id, List.of())));
        }
        return result;
    }

    @Transactional
    public StationView createStation(StationInput input) {
        String name = DiningService.clean(input.name(), 40, "la estación");
        long count = count("SELECT count(*) FROM kitchen_stations", Map.of());
        if (count >= MAX_STATIONS) {
            throw new BusinessRuleException("Máximo " + MAX_STATIONS + " estaciones.");
        }
        requireUniqueName(name, null);
        List<UUID> categoryIds = distinct(input.categoryIds());
        List<UUID> productIds = distinct(input.productIds());
        requireAssignments(categoryIds, productIds);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        UUID actor = CurrentActor.requireUserId();
        if (input.main()) {
            em.createNativeQuery("UPDATE kitchen_stations SET is_main = FALSE, version = version + 1 WHERE is_main")
                    .executeUpdate();
        }
        em.createNativeQuery("""
                INSERT INTO kitchen_stations (id, name, is_main, position, active, created_at, created_by, updated_at,
                                              updated_by, version)
                VALUES (?1, ?2, ?3, ?4, TRUE, ?5, ?6, ?5, ?6, 0)""")
                .setParameter(1, id).setParameter(2, name).setParameter(3, input.main())
                .setParameter(4, input.position() == null ? (int) count : input.position())
                .setParameter(5, now).setParameter(6, actor).executeUpdate();
        writeAssignments(id, categoryIds, productIds);
        StationView after = station(id);
        audit.log("KITCHEN_STATION_CREATED", "kitchen_station", id, null, stationData(after));
        return after;
    }

    @Transactional
    public StationView updateStation(UUID id, StationInput input) {
        StationView before = station(id);
        String name = DiningService.clean(input.name(), 40, "la estación");
        requireUniqueName(name, id);
        if (before.main() && !input.main()) {
            throw new BusinessRuleException("Para cambiar la estación principal, marca otra como principal.");
        }
        boolean active = input.main() || input.active();
        List<UUID> categoryIds = distinct(input.categoryIds());
        List<UUID> productIds = distinct(input.productIds());
        requireAssignments(categoryIds, productIds);
        if (input.main() && !before.main()) {
            em.createNativeQuery("UPDATE kitchen_stations SET is_main = FALSE, version = version + 1 WHERE is_main")
                    .executeUpdate();
        }
        em.createNativeQuery("""
                UPDATE kitchen_stations SET name = ?2, is_main = ?3, active = ?4, position = ?5, updated_at = ?6,
                       updated_by = ?7, version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, name).setParameter(3, input.main()).setParameter(4, active)
                .setParameter(5, input.position() == null ? before.position() : input.position())
                .setParameter(6, Instant.now()).setParameter(7, CurrentActor.requireUserId()).executeUpdate();
        writeAssignments(id, categoryIds, productIds);
        StationView after = station(id);
        audit.log("KITCHEN_STATION_UPDATED", "kitchen_station", id, stationData(before), stationData(after));
        return after;
    }

    StationView station(UUID id) {
        return stations().stream().filter(s -> s.id().equals(id)).findFirst()
                .orElseThrow(() -> new NotFoundException("Estación no encontrada."));
    }

    // ------------------------------------------------------------------ enviar

    /**
     * Envía a cocina las líneas indicadas de la cuenta (ya bloqueada por quien llama): una comanda por estación, en
     * el orden de las estaciones. Devuelve las comandas creadas.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public List<TicketSummary> send(UUID tabId, String tabLabel, UUID branchId, List<UUID> itemIds) {
        if (itemIds.isEmpty()) {
            return List.of();
        }
        List<Object[]> items = dining.rows("""
                SELECT i.id, i.product_id, i.name, i.quantity FROM tab_items i
                WHERE i.tab_id = :t AND i.id IN (:ids) AND i.sent_at IS NULL AND i.voided_at IS NULL
                ORDER BY i.position""", Map.of("t", tabId, "ids", itemIds));
        Set<UUID> products = new LinkedHashSet<>();
        items.forEach(i -> products.add((UUID) i[1]));
        Map<UUID, UUID> stationOf = stationsFor(products);
        Map<UUID, String> names = new LinkedHashMap<>();
        for (Object[] s : dining.rows("""
                SELECT id, name FROM kitchen_stations WHERE active ORDER BY is_main DESC, position, lower(name)""",
                Map.of())) {
            names.put((UUID) s[0], (String) s[1]);
        }
        Map<UUID, List<Object[]>> byStation = new LinkedHashMap<>();
        names.keySet().forEach(s -> byStation.put(s, new ArrayList<>()));
        for (Object[] i : items) {
            byStation.get(stationOf.get((UUID) i[1])).add(i);
        }
        UUID actor = CurrentActor.requireUserId();
        Instant now = Instant.now();
        String label = tabLabel.length() > 80 ? tabLabel.substring(0, 80) : tabLabel;
        List<TicketSummary> created = new ArrayList<>();
        List<Map<String, Object>> auditTickets = new ArrayList<>();
        for (Map.Entry<UUID, List<Object[]>> e : byStation.entrySet()) {
            if (e.getValue().isEmpty()) {
                continue;
            }
            UUID ticketId = Ids.newId();
            em.createNativeQuery("""
                    INSERT INTO kitchen_tickets (id, branch_id, tab_id, station_id, station_name, tab_label, sent_by,
                                                 sent_at, status, print_count)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'NEW', 0)""")
                    .setParameter(1, ticketId).setParameter(2, branchId).setParameter(3, tabId)
                    .setParameter(4, e.getKey()).setParameter(5, names.get(e.getKey())).setParameter(6, label)
                    .setParameter(7, actor).setParameter(8, now).executeUpdate();
            List<UUID> ids = e.getValue().stream().map(i -> (UUID) i[0]).toList();
            em.createNativeQuery("UPDATE tab_items SET sent_at = :at, ticket_id = :k WHERE id IN (:ids)")
                    .setParameter("ids", ids).setParameter("at", now).setParameter("k", ticketId).executeUpdate();
            long number = ((Number) em.createNativeQuery("SELECT number FROM kitchen_tickets WHERE id = ?1")
                    .setParameter(1, ticketId).getSingleResult()).longValue();
            created.add(new TicketSummary(ticketId, number, names.get(e.getKey()), now, 0, ids.size()));
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("number", number);
            t.put("station", names.get(e.getKey()));
            t.put("items", e.getValue().stream().map(i -> ((BigDecimal) i[3]).stripTrailingZeros().toPlainString()
                    + " × " + i[2]).toList());
            auditTickets.add(t);
        }
        if (!created.isEmpty()) {
            audit.log("KITCHEN_SENT", "tab", tabId, null, Map.of("label", label, "tickets", auditTickets));
        }
        return created;
    }

    /** Estación de cada producto: la suya, si no la de su categoría, si no la principal (solo estaciones activas). */
    Map<UUID, UUID> stationsFor(Collection<UUID> productIds) {
        UUID main = mainStation();
        Map<UUID, UUID> result = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return result;
        }
        for (Object[] r : dining.rows("""
                SELECT p.id, coalesce(sp.id, sc.id)
                FROM products p
                LEFT JOIN kitchen_station_products ksp ON ksp.product_id = p.id
                LEFT JOIN kitchen_stations sp ON sp.id = ksp.station_id AND sp.active
                LEFT JOIN kitchen_station_categories ksc ON ksc.category_id = p.category_id
                LEFT JOIN kitchen_stations sc ON sc.id = ksc.station_id AND sc.active
                WHERE p.id IN (:ids)""", Map.of("ids", List.copyOf(productIds)))) {
            result.put((UUID) r[0], r[1] == null ? main : (UUID) r[1]);
        }
        productIds.forEach(p -> result.putIfAbsent(p, main));
        return result;
    }

    private UUID mainStation() {
        List<Object[]> found = dining.rows("SELECT id, name FROM kitchen_stations WHERE is_main", Map.of());
        if (found.isEmpty()) {
            throw new ConflictException("No hay estación principal de cocina.");
        }
        return (UUID) found.getFirst()[0];
    }

    // ------------------------------------------------------------------ comandas

    /** Comandas de la cuenta (por sus líneas: tras unir cuentas aparecen también las de la otra). */
    List<TicketSummary> ticketsOfTab(UUID tabId) {
        List<TicketSummary> result = new ArrayList<>();
        for (Object[] r : dining.rows("""
                SELECT k.id, k.number, k.station_name, k.sent_at, k.print_count, count(i.id)
                FROM kitchen_tickets k JOIN tab_items i ON i.ticket_id = k.id
                WHERE i.tab_id = :t
                GROUP BY k.id ORDER BY k.number""", Map.of("t", tabId))) {
            result.add(new TicketSummary((UUID) r[0], ((Number) r[1]).longValue(), (String) r[2], Rows.instant(r[3]),
                    ((Number) r[4]).intValue(), ((Number) r[5]).intValue()));
        }
        return result;
    }

    /**
     * Comandas recientes de la sucursal (las últimas 12 horas, la más nueva primero). Con {@code pending}: las que
     * nadie ha impreso de las últimas 2 horas, la más vieja primero (para la impresora automática).
     */
    @Transactional(readOnly = true)
    public List<TicketView> tickets(UUID requestedBranch, List<UUID> stationIds, boolean pending) {
        UUID branchId = dining.resolveBranch(requestedBranch);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("b", branchId);
        params.put("since", Instant.now().minus(pending ? AUTO_PRINT_WINDOW : RECENT_WINDOW));
        StringBuilder sql = new StringBuilder("SELECT id FROM kitchen_tickets WHERE branch_id = :b AND sent_at >= :since");
        if (stationIds != null && !stationIds.isEmpty()) {
            sql.append(" AND station_id IN (:s)");
            params.put("s", stationIds);
        }
        sql.append(pending ? " AND print_count = 0 ORDER BY number" : " ORDER BY number DESC");
        sql.append(" LIMIT ").append(MAX_TICKETS);
        var query = em.createNativeQuery(sql.toString());
        params.forEach(query::setParameter);
        List<UUID> ids = new ArrayList<>();
        for (Object id : query.getResultList()) {
            ids.add((UUID) id);
        }
        return views(ids);
    }

    @Transactional(readOnly = true)
    public TicketView ticket(UUID id) {
        List<TicketView> found = views(List.of(id));
        if (found.isEmpty()) {
            throw new NotFoundException("Comanda no encontrada.");
        }
        dining.requireBranch(found.getFirst().branchId());
        return found.getFirst();
    }

    /**
     * Registra una impresión. {@code auto}: la impresora automática reclama la primera (409 si otro equipo ya la
     * imprimió). A mano: siempre se puede; si ya se había impreso, queda en la auditoría como reimpresión.
     */
    @Transactional
    public TicketView print(UUID id, boolean auto) {
        List<Object[]> found = dining.rows("""
                SELECT branch_id, print_count, number, station_name, tab_label FROM kitchen_tickets
                WHERE id = :k FOR UPDATE""", Map.of("k", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Comanda no encontrada.");
        }
        Object[] r = found.getFirst();
        dining.requireBranch((UUID) r[0]);
        int printed = ((Number) r[1]).intValue();
        if (auto && printed > 0) {
            throw new ConflictException("Esta comanda ya se imprimió.");
        }
        em.createNativeQuery("""
                UPDATE kitchen_tickets SET print_count = print_count + 1, printed_at = coalesce(printed_at, ?2)
                WHERE id = ?1""").setParameter(1, id).setParameter(2, Instant.now()).executeUpdate();
        if (printed > 0) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("number", ((Number) r[2]).longValue());
            data.put("station", r[3]);
            data.put("label", r[4]);
            data.put("copy", printed + 1);
            audit.log("KITCHEN_TICKET_REPRINTED", "kitchen_ticket", id, null, data);
        }
        return ticket(id);
    }

    private List<TicketView> views(List<UUID> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<UUID, List<TicketModifier>> mods = new LinkedHashMap<>();
        for (Object[] m : dining.rows("""
                SELECT m.tab_item_id, m.group_name, m.option_name, m.quantity,
                       coalesce(g.min_select >= 1 AND g.max_select = 1, FALSE)
                FROM tab_item_modifiers m
                JOIN tab_items i ON i.id = m.tab_item_id
                LEFT JOIN modifier_options o ON o.id = m.option_id
                LEFT JOIN modifier_groups g ON g.id = o.group_id
                WHERE i.ticket_id IN (:ids) ORDER BY m.tab_item_id, m.position""", Map.of("ids", ids))) {
            mods.computeIfAbsent((UUID) m[0], k -> new ArrayList<>()).add(new TicketModifier((String) m[1],
                    (String) m[2], ((Number) m[3]).intValue(), (Boolean) m[4]));
        }
        Map<UUID, List<TicketItem>> items = new LinkedHashMap<>();
        for (Object[] i : dining.rows("""
                SELECT ticket_id, id, name, quantity, note, voided_at FROM tab_items
                WHERE ticket_id IN (:ids) ORDER BY position""", Map.of("ids", ids))) {
            UUID itemId = (UUID) i[1];
            items.computeIfAbsent((UUID) i[0], k -> new ArrayList<>()).add(new TicketItem(itemId, (String) i[2],
                    ((BigDecimal) i[3]).setScale(4, RoundingMode.HALF_UP).stripTrailingZeros(), (String) i[4],
                    mods.getOrDefault(itemId, List.of()), i[5] != null));
        }
        List<Object[]> data = dining.rows("""
                SELECT k.id, k.number, k.branch_id, k.tab_id, k.tab_label, t.kind, t.guests, t.notes, k.station_id,
                       k.station_name, k.sent_at, k.sent_by, k.status, k.print_count
                FROM kitchen_tickets k JOIN tabs t ON t.id = k.tab_id
                WHERE k.id IN (:ids)""", Map.of("ids", ids));
        Set<UUID> people = new HashSet<>();
        data.forEach(r -> people.add((UUID) r[11]));
        Map<UUID, String> names = members.displayNames(people);
        Map<UUID, TicketView> byId = new LinkedHashMap<>();
        for (Object[] r : data) {
            UUID id = (UUID) r[0];
            byId.put(id, new TicketView(id, ((Number) r[1]).longValue(), (UUID) r[2], (UUID) r[3], (String) r[4],
                    (String) r[5], Rows.integer(r[6]), (String) r[7], (UUID) r[8], (String) r[9], Rows.instant(r[10]),
                    names.get((UUID) r[11]), (String) r[12], ((Number) r[13]).intValue(),
                    items.getOrDefault(id, List.of())));
        }
        // Mismo orden en que se pidieron.
        return ids.stream().map(byId::get).filter(v -> v != null).toList();
    }

    // ------------------------------------------------------------------ apoyo

    private void writeAssignments(UUID stationId, List<UUID> categoryIds, List<UUID> productIds) {
        em.createNativeQuery("DELETE FROM kitchen_station_categories WHERE station_id = ?1").setParameter(1, stationId)
                .executeUpdate();
        em.createNativeQuery("DELETE FROM kitchen_station_products WHERE station_id = ?1").setParameter(1, stationId)
                .executeUpdate();
        // Una categoría o un producto van a una sola estación: si estaban en otra, pasan a esta.
        for (UUID categoryId : categoryIds) {
            em.createNativeQuery("""
                    INSERT INTO kitchen_station_categories (category_id, station_id) VALUES (?1, ?2)
                    ON CONFLICT (category_id) DO UPDATE SET station_id = excluded.station_id""")
                    .setParameter(1, categoryId).setParameter(2, stationId).executeUpdate();
        }
        for (UUID productId : productIds) {
            em.createNativeQuery("""
                    INSERT INTO kitchen_station_products (product_id, station_id) VALUES (?1, ?2)
                    ON CONFLICT (product_id) DO UPDATE SET station_id = excluded.station_id""")
                    .setParameter(1, productId).setParameter(2, stationId).executeUpdate();
        }
    }

    private void requireAssignments(List<UUID> categoryIds, List<UUID> productIds) {
        if (categoryIds.size() + productIds.size() > MAX_ASSIGNED) {
            throw new BusinessRuleException("Máximo " + MAX_ASSIGNED + " productos y categorías por estación.");
        }
        requireExisting("categories", categoryIds, "Una de las categorías no existe.");
        requireExisting("products", productIds, "Uno de los productos no existe.");
    }

    private void requireExisting(String table, List<UUID> ids, String message) {
        if (ids.isEmpty()) {
            return;
        }
        if (count("SELECT count(*) FROM " + table + " WHERE id IN (:ids)", Map.of("ids", ids)) != ids.size()) {
            throw new NotFoundException(message);
        }
    }

    private void requireUniqueName(String name, UUID except) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("n", name);
        if (except != null) {
            params.put("x", except);
        }
        if (count("SELECT count(*) FROM kitchen_stations WHERE lower(name) = lower(:n)"
                + (except == null ? "" : " AND id <> :x"), params) > 0) {
            throw new ConflictException("Ya hay una estación llamada " + name + ".");
        }
    }

    private static List<UUID> distinct(List<UUID> ids) {
        return ids == null ? List.of() : List.copyOf(new LinkedHashSet<>(ids.stream().filter(i -> i != null).toList()));
    }

    private Map<UUID, List<Ref>> refs(String sql) {
        Map<UUID, List<Ref>> result = new LinkedHashMap<>();
        for (Object[] r : dining.rows(sql, Map.of())) {
            result.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new Ref((UUID) r[1], (String) r[2]));
        }
        return result;
    }

    private static Map<String, Object> stationData(StationView s) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", s.name());
        data.put("main", s.main());
        data.put("active", s.active());
        data.put("categories", s.categories().stream().map(Ref::name).toList());
        data.put("products", s.products().stream().map(Ref::name).toList());
        return data;
    }

    private long count(String sql, Map<String, Object> params) {
        var query = em.createNativeQuery(sql);
        params.forEach(query::setParameter);
        return ((Number) query.getSingleResult()).longValue();
    }
}
