package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Adiciones y modificadores (Fase 12b-1, decisión 268): grupos reutilizables ("Tamaño", "Licor", "Extras") con sus
 * opciones y precios, asignados a productos o a categorías completas. Una opción quitada se borra (las ventas guardan
 * su nombre y precio); un grupo no se borra, se desactiva.
 */
@Service
public class ModifierService implements ModifierApi {

    static final int MAX_OPTIONS = 30;
    static final int MAX_ASSIGNED = 500;
    static final BigDecimal MAX_DELTA = new BigDecimal("10000000");

    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public ModifierService(AuditLogger audit) {
        this.audit = audit;
    }

    public record OptionInput(UUID id, String name, BigDecimal priceDelta, Integer maxQuantity, Boolean active) {
    }

    public record GroupInput(String name, int minSelect, int maxSelect, boolean active, List<OptionInput> options,
                             List<UUID> productIds, List<UUID> categoryIds) {
    }

    public record OptionView(UUID id, String name, BigDecimal priceDelta, int maxQuantity, boolean active) {
    }

    public record Ref(UUID id, String name) {
    }

    public record GroupView(UUID id, String name, int minSelect, int maxSelect, boolean active,
                            List<OptionView> options, List<Ref> products, List<Ref> categories) {
    }

    /** Lo que el POS necesita: grupos activos con opciones activas y, por producto, los grupos que le aplican. */
    public record PosCatalog(List<Group> groups, Map<UUID, List<UUID>> products) {
    }

    // ------------------------------------------------------------------ consulta

    @Transactional(readOnly = true)
    public List<GroupView> list() {
        Map<UUID, List<OptionView>> options = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT group_id, id, name, price_delta, max_quantity, active FROM modifier_options
                ORDER BY group_id, position""", null)) {
            options.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new OptionView((UUID) r[1],
                    (String) r[2], money(r[3]), ((Number) r[4]).intValue(), (Boolean) r[5]));
        }
        Map<UUID, List<Ref>> products = refs("""
                SELECT pmg.group_id, p.id, p.name FROM product_modifier_groups pmg
                JOIN products p ON p.id = pmg.product_id ORDER BY pmg.group_id, p.name""");
        Map<UUID, List<Ref>> categories = refs("""
                SELECT cmg.group_id, c.id, c.name FROM category_modifier_groups cmg
                JOIN categories c ON c.id = cmg.category_id ORDER BY cmg.group_id, c.name""");
        List<GroupView> result = new ArrayList<>();
        for (Object[] r : rows("""
                SELECT id, name, min_select, max_select, active FROM modifier_groups
                ORDER BY active DESC, lower(name)""", null)) {
            UUID id = (UUID) r[0];
            result.add(new GroupView(id, (String) r[1], ((Number) r[2]).intValue(), ((Number) r[3]).intValue(),
                    (Boolean) r[4], options.getOrDefault(id, List.of()), products.getOrDefault(id, List.of()),
                    categories.getOrDefault(id, List.of())));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public GroupView get(UUID id) {
        return list().stream().filter(g -> g.id().equals(id)).findFirst()
                .orElseThrow(() -> new NotFoundException("Grupo de adiciones no encontrado."));
    }

    /**
     * Para el POS: los grupos activos y, por producto activo, los grupos que le aplican (los suyos y los de su
     * categoría) en el orden en que se eligen.
     */
    @Transactional(readOnly = true)
    public PosCatalog posCatalog() {
        List<Group> groups = activeGroups(null);
        Map<UUID, Integer> order = new LinkedHashMap<>();
        for (int i = 0; i < groups.size(); i++) {
            order.put(groups.get(i).id(), i);
        }
        Map<UUID, Set<UUID>> byProduct = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT pmg.product_id, pmg.group_id FROM product_modifier_groups pmg
                JOIN products p ON p.id = pmg.product_id WHERE p.active
                UNION
                SELECT p.id, cmg.group_id FROM category_modifier_groups cmg
                JOIN products p ON p.category_id = cmg.category_id WHERE p.active""", null)) {
            if (order.containsKey((UUID) r[1])) {
                byProduct.computeIfAbsent((UUID) r[0], k -> new HashSet<>()).add((UUID) r[1]);
            }
        }
        Map<UUID, List<UUID>> products = new LinkedHashMap<>();
        byProduct.forEach((product, ids) -> products.put(product,
                ids.stream().sorted((a, b) -> Integer.compare(order.get(a), order.get(b))).toList()));
        return new PosCatalog(groups, products);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, List<Group>> activeGroupsFor(Collection<UUID> productIds) {
        Map<UUID, List<Group>> result = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return result;
        }
        List<UUID> ids = List.copyOf(new LinkedHashSet<>(productIds));
        Map<UUID, Set<UUID>> groupIds = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT p.id, pmg.group_id FROM products p JOIN product_modifier_groups pmg ON pmg.product_id = p.id
                WHERE p.id IN (:ids)
                UNION
                SELECT p.id, cmg.group_id FROM products p JOIN category_modifier_groups cmg ON cmg.category_id = p.category_id
                WHERE p.id IN (:ids)""", ids)) {
            groupIds.computeIfAbsent((UUID) r[0], k -> new HashSet<>()).add((UUID) r[1]);
        }
        if (groupIds.isEmpty()) {
            return result;
        }
        Set<UUID> all = new HashSet<>();
        groupIds.values().forEach(all::addAll);
        List<Group> groups = activeGroups(all);
        for (UUID productId : ids) {
            Set<UUID> mine = groupIds.getOrDefault(productId, Set.of());
            List<Group> list = groups.stream().filter(g -> mine.contains(g.id())).toList();
            if (!list.isEmpty()) {
                result.put(productId, list);
            }
        }
        return result;
    }

    // ------------------------------------------------------------------ cambios

    @Transactional
    public GroupView create(GroupInput input) {
        GroupInput clean = validate(input, null);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        em.createNativeQuery("""
                INSERT INTO modifier_groups (id, name, min_select, max_select, active, created_at, updated_at, version)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 0)""")
                .setParameter(1, id).setParameter(2, clean.name()).setParameter(3, clean.minSelect())
                .setParameter(4, clean.maxSelect()).setParameter(5, clean.active()).setParameter(6, now)
                .executeUpdate();
        writeOptions(id, clean.options());
        writeAssignments(id, clean.productIds(), clean.categoryIds());
        GroupView view = get(id);
        audit.log("MODIFIER_GROUP_CREATED", "modifier_group", id, null, snapshot(view));
        return view;
    }

    @Transactional
    public GroupView update(UUID id, GroupInput input) {
        GroupView before = get(id);
        GroupInput clean = validate(input, id);
        em.createNativeQuery("""
                UPDATE modifier_groups SET name = ?2, min_select = ?3, max_select = ?4, active = ?5, updated_at = ?6,
                       version = version + 1
                WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, clean.name()).setParameter(3, clean.minSelect())
                .setParameter(4, clean.maxSelect()).setParameter(5, clean.active()).setParameter(6, Instant.now())
                .executeUpdate();
        writeOptions(id, clean.options());
        writeAssignments(id, clean.productIds(), clean.categoryIds());
        GroupView after = get(id);
        audit.log("MODIFIER_GROUP_UPDATED", "modifier_group", id, snapshot(before), snapshot(after));
        return after;
    }

    // ------------------------------------------------------------------ validación

    /** Limpia y valida lo que llega; {@code id} nulo al crear (para el nombre repetido). */
    GroupInput validate(GroupInput input, UUID id) {
        String name = cleanName(input.name(), "el grupo");
        if (input.maxSelect() < 1 || input.maxSelect() > 20) {
            throw new BusinessRuleException("El máximo de opciones por producto va de 1 a 20.");
        }
        if (input.minSelect() < 0 || input.minSelect() > input.maxSelect()) {
            throw new BusinessRuleException("El mínimo de opciones no puede ser mayor que el máximo.");
        }
        List<OptionInput> options = input.options() == null ? List.of() : input.options();
        if (options.isEmpty()) {
            throw new BusinessRuleException("Agrega al menos una opción al grupo " + name + ".");
        }
        if (options.size() > MAX_OPTIONS) {
            throw new BusinessRuleException("Máximo " + MAX_OPTIONS + " opciones por grupo.");
        }
        Set<String> names = new HashSet<>();
        List<OptionInput> clean = new ArrayList<>();
        int activeUnits = 0;
        for (OptionInput o : options) {
            String optionName = cleanName(o.name(), "la opción");
            if (!names.add(optionName.toLowerCase(Locale.ROOT))) {
                throw new BusinessRuleException("La opción " + optionName + " está repetida.");
            }
            BigDecimal delta = o.priceDelta() == null ? BigDecimal.ZERO : o.priceDelta().setScale(2, RoundingMode.HALF_UP);
            if (delta.abs().compareTo(MAX_DELTA) >= 0) {
                throw new BusinessRuleException("El precio de " + optionName + " no es válido.");
            }
            if (delta.stripTrailingZeros().scale() > 0) {
                throw new BusinessRuleException("El precio de " + optionName + " va en pesos enteros.");
            }
            int max = o.maxQuantity() == null ? 1 : o.maxQuantity();
            if (max < 1 || max > 10) {
                throw new BusinessRuleException("Las veces que se puede elegir " + optionName + " van de 1 a 10.");
            }
            boolean active = o.active() == null || o.active();
            if (active) {
                activeUnits += Math.min(max, input.maxSelect());
            }
            clean.add(new OptionInput(o.id(), optionName, delta, max, active));
        }
        if (input.active() && activeUnits < input.minSelect()) {
            throw new BusinessRuleException("Con las opciones activas no se alcanza el mínimo de " + input.minSelect()
                    + " en " + name + ".");
        }
        var sameName = id == null
                ? em.createNativeQuery("SELECT count(*) FROM modifier_groups WHERE lower(name) = lower(?1)")
                        .setParameter(1, name)
                : em.createNativeQuery("SELECT count(*) FROM modifier_groups WHERE lower(name) = lower(?1) AND id <> ?2")
                        .setParameter(1, name).setParameter(2, id);
        long same = ((Number) sameName.getSingleResult()).longValue();
        if (same > 0) {
            throw new ConflictException("Ya hay un grupo de adiciones llamado " + name + ".");
        }
        List<UUID> productIds = distinct(input.productIds());
        List<UUID> categoryIds = distinct(input.categoryIds());
        if (productIds.size() + categoryIds.size() > MAX_ASSIGNED) {
            throw new BusinessRuleException("Máximo " + MAX_ASSIGNED + " productos y categorías por grupo.");
        }
        requireExisting("products", productIds, "Uno de los productos no existe.");
        requireExisting("categories", categoryIds, "Una de las categorías no existe.");
        return new GroupInput(name, input.minSelect(), input.maxSelect(), input.active(), clean, productIds,
                categoryIds);
    }

    private static String cleanName(String raw, String what) {
        String name = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            throw new BusinessRuleException("Escribe el nombre de " + what + ".");
        }
        if (name.length() > 60) {
            throw new BusinessRuleException("El nombre de " + what + " admite hasta 60 caracteres.");
        }
        return name;
    }

    private static List<UUID> distinct(List<UUID> ids) {
        return ids == null ? List.of() : List.copyOf(new LinkedHashSet<>(ids.stream().filter(i -> i != null).toList()));
    }

    private void requireExisting(String table, List<UUID> ids, String message) {
        if (ids.isEmpty()) {
            return;
        }
        long found = ((Number) em.createNativeQuery("SELECT count(*) FROM " + table + " WHERE id IN (:ids)")
                .setParameter("ids", ids).getSingleResult()).longValue();
        if (found != ids.size()) {
            throw new NotFoundException(message);
        }
    }

    // ------------------------------------------------------------------ escritura

    /** Las opciones con id se actualizan, las nuevas se crean y las que ya no vienen se borran. */
    private void writeOptions(UUID groupId, List<OptionInput> options) {
        Set<UUID> existing = new HashSet<>();
        for (Object[] r : rows("SELECT id, id FROM modifier_options WHERE group_id = :g", groupId)) {
            existing.add((UUID) r[0]);
        }
        Set<UUID> kept = new HashSet<>();
        int position = 0;
        for (OptionInput o : options) {
            position++;
            if (o.id() != null && existing.contains(o.id())) {
                kept.add(o.id());
                em.createNativeQuery("""
                        UPDATE modifier_options SET position = ?2, name = ?3, price_delta = ?4, max_quantity = ?5,
                               active = ?6 WHERE id = ?1""")
                        .setParameter(1, o.id()).setParameter(2, position).setParameter(3, o.name())
                        .setParameter(4, o.priceDelta()).setParameter(5, o.maxQuantity()).setParameter(6, o.active())
                        .executeUpdate();
            } else {
                em.createNativeQuery("""
                        INSERT INTO modifier_options (id, group_id, position, name, price_delta, max_quantity, active)
                        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)""")
                        .setParameter(1, Ids.newId()).setParameter(2, groupId).setParameter(3, position)
                        .setParameter(4, o.name()).setParameter(5, o.priceDelta()).setParameter(6, o.maxQuantity())
                        .setParameter(7, o.active())
                        .executeUpdate();
            }
        }
        for (UUID gone : existing) {
            if (!kept.contains(gone)) {
                em.createNativeQuery("DELETE FROM modifier_options WHERE id = ?1").setParameter(1, gone).executeUpdate();
            }
        }
    }

    private void writeAssignments(UUID groupId, List<UUID> productIds, List<UUID> categoryIds) {
        em.createNativeQuery("DELETE FROM product_modifier_groups WHERE group_id = ?1").setParameter(1, groupId)
                .executeUpdate();
        em.createNativeQuery("DELETE FROM category_modifier_groups WHERE group_id = ?1").setParameter(1, groupId)
                .executeUpdate();
        for (UUID productId : productIds) {
            em.createNativeQuery("INSERT INTO product_modifier_groups (product_id, group_id) VALUES (?1, ?2)")
                    .setParameter(1, productId).setParameter(2, groupId).executeUpdate();
        }
        for (UUID categoryId : categoryIds) {
            em.createNativeQuery("INSERT INTO category_modifier_groups (category_id, group_id) VALUES (?1, ?2)")
                    .setParameter(1, categoryId).setParameter(2, groupId).executeUpdate();
        }
    }

    // ------------------------------------------------------------------ apoyo

    /** Grupos activos con opciones activas (todos, o solo {@code ids}); los obligatorios primero, luego por nombre. */
    private List<Group> activeGroups(Set<UUID> ids) {
        Map<UUID, List<Option>> options = new LinkedHashMap<>();
        for (Object[] r : rows("""
                SELECT group_id, id, name, price_delta, max_quantity FROM modifier_options
                WHERE active ORDER BY group_id, position""", null)) {
            options.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new Option((UUID) r[1], (String) r[2],
                    money(r[3]), ((Number) r[4]).intValue()));
        }
        List<Group> result = new ArrayList<>();
        for (Object[] r : rows("""
                SELECT id, name, min_select, max_select FROM modifier_groups WHERE active
                ORDER BY (min_select > 0) DESC, lower(name)""", null)) {
            UUID id = (UUID) r[0];
            List<Option> mine = options.getOrDefault(id, List.of());
            if ((ids == null || ids.contains(id)) && !mine.isEmpty()) {
                result.add(new Group(id, (String) r[1], ((Number) r[2]).intValue(), ((Number) r[3]).intValue(),
                        mine));
            }
        }
        return result;
    }

    private Map<UUID, List<Ref>> refs(String sql) {
        Map<UUID, List<Ref>> result = new LinkedHashMap<>();
        for (Object[] r : rows(sql, null)) {
            result.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new Ref((UUID) r[1], (String) r[2]));
        }
        return result;
    }

    /** Consulta nativa; {@code param} va como {@code :ids} (lista) o {@code :g} (uno), si la consulta lo usa. */
    @SuppressWarnings("unchecked")
    private List<Object[]> rows(String sql, Object param) {
        var query = em.createNativeQuery(sql);
        if (param instanceof Collection<?> list) {
            query.setParameter("ids", list);
        } else if (param != null) {
            query.setParameter("g", param);
        }
        return query.getResultList();
    }

    private static BigDecimal money(Object value) {
        return ((BigDecimal) value).setScale(2, RoundingMode.HALF_UP);
    }

    private static Map<String, Object> snapshot(GroupView g) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", g.name());
        data.put("minSelect", g.minSelect());
        data.put("maxSelect", g.maxSelect());
        data.put("active", g.active());
        data.put("options", g.options().stream()
                .map(o -> o.name() + " " + o.priceDelta().stripTrailingZeros().toPlainString()
                        + (o.maxQuantity() > 1 ? " ×" + o.maxQuantity() : "") + (o.active() ? "" : " (inactiva)"))
                .toList());
        data.put("products", g.products().stream().map(Ref::name).toList());
        data.put("categories", g.categories().stream().map(Ref::name).toList());
        return data;
    }
}
