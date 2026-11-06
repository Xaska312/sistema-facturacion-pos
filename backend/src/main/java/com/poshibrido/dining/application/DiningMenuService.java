package com.poshibrido.dining.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.dining.application.KitchenViews.Ref;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.domain.PlanFeature;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Cartas por piso (decisión 294): cada carta de una sucursal tiene su caja, sus categorías y productos sueltos (que
 * mandan sobre su categoría). Al pedir, el mesero ve cada carta por separado; al cobrar, lo de cada carta queda en la
 * caja de su carta ({@link TabService#charge}). Configurar pide {@code tables:manage} y la función del plan
 * "Caja por zona" (plan Empresa).
 */
@Service
@RequiredArgsConstructor
public class DiningMenuService {

    static final int MAX_MENUS = 10;
    static final int MAX_ASSIGNED = 500;

    private final DiningService dining;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record MenuInput(String name, UUID cashRegisterId, Boolean active, Integer position, List<UUID> categoryIds,
                            List<UUID> productIds) {
    }

    public record MenuView(UUID id, UUID branchId, String name, Ref cashRegister, int position, boolean active,
                           List<Ref> categories, List<Ref> products) {
    }

    /** La carta (activa) de un producto en una sucursal, con su caja. */
    public record Route(UUID menuId, String menuName, UUID cashRegisterId, String cashRegisterName) {
    }

    @Transactional(readOnly = true)
    public List<MenuView> menus(UUID requestedBranch) {
        UUID branchId = dining.resolveBranch(requestedBranch);
        Map<UUID, List<Ref>> categories = refs("""
                SELECT mc.menu_id, c.id, c.name FROM dining_menu_categories mc JOIN categories c ON c.id = mc.category_id
                WHERE mc.branch_id = :b ORDER BY mc.menu_id, lower(c.name)""", branchId);
        Map<UUID, List<Ref>> products = refs("""
                SELECT mp.menu_id, p.id, p.name FROM dining_menu_products mp JOIN products p ON p.id = mp.product_id
                WHERE mp.branch_id = :b ORDER BY mp.menu_id, lower(p.name)""", branchId);
        List<MenuView> result = new ArrayList<>();
        for (Object[] r : dining.rows("""
                SELECT m.id, m.name, r.id, r.name, m.position, m.active FROM dining_menus m
                JOIN cash_registers r ON r.id = m.cash_register_id
                WHERE m.branch_id = :b ORDER BY m.active DESC, m.position, lower(m.name)""", Map.of("b", branchId))) {
            UUID id = (UUID) r[0];
            result.add(new MenuView(id, branchId, (String) r[1], new Ref((UUID) r[2], (String) r[3]),
                    ((Number) r[4]).intValue(), (Boolean) r[5], categories.getOrDefault(id, List.of()),
                    products.getOrDefault(id, List.of())));
        }
        return result;
    }

    @Transactional
    public MenuView create(UUID branchId, MenuInput input) {
        requirePlan();
        dining.requireBranch(branchId);
        String name = DiningService.clean(input.name(), 40, "la carta");
        long count = count("SELECT count(*) FROM dining_menus WHERE branch_id = :b", Map.of("b", branchId));
        if (count >= MAX_MENUS) {
            throw new BusinessRuleException("Máximo " + MAX_MENUS + " cartas por sucursal.");
        }
        requireUniqueName(branchId, name, null);
        requireRegister(branchId, input.cashRegisterId());
        List<UUID> categoryIds = distinct(input.categoryIds());
        List<UUID> productIds = distinct(input.productIds());
        requireAssignments(categoryIds, productIds);
        UUID id = Ids.newId();
        Instant now = Instant.now();
        UUID actor = CurrentActor.requireUserId();
        em.createNativeQuery("""
                INSERT INTO dining_menus (id, branch_id, name, cash_register_id, position, active, created_at, created_by,
                                          updated_at, updated_by, version)
                VALUES (?1, ?2, ?3, ?4, ?5, TRUE, ?6, ?7, ?6, ?7, 0)""")
                .setParameter(1, id).setParameter(2, branchId).setParameter(3, name)
                .setParameter(4, input.cashRegisterId())
                .setParameter(5, input.position() == null ? (int) count : input.position())
                .setParameter(6, now).setParameter(7, actor).executeUpdate();
        writeAssignments(branchId, id, categoryIds, productIds);
        MenuView after = menu(id);
        audit.log("DINING_MENU_CREATED", "dining_menu", id, null, data(after));
        return after;
    }

    @Transactional
    public MenuView update(UUID id, MenuInput input) {
        requirePlan();
        MenuView before = menu(id);
        dining.requireBranch(before.branchId());
        String name = DiningService.clean(input.name(), 40, "la carta");
        requireUniqueName(before.branchId(), name, id);
        requireRegister(before.branchId(), input.cashRegisterId());
        List<UUID> categoryIds = distinct(input.categoryIds());
        List<UUID> productIds = distinct(input.productIds());
        requireAssignments(categoryIds, productIds);
        em.createNativeQuery("""
                UPDATE dining_menus SET name = ?2, cash_register_id = ?3, active = ?4, position = ?5, updated_at = ?6,
                       updated_by = ?7, version = version + 1 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, name).setParameter(3, input.cashRegisterId())
                .setParameter(4, input.active() == null || input.active())
                .setParameter(5, input.position() == null ? before.position() : input.position())
                .setParameter(6, Instant.now()).setParameter(7, CurrentActor.requireUserId()).executeUpdate();
        writeAssignments(before.branchId(), id, categoryIds, productIds);
        MenuView after = menu(id);
        audit.log("DINING_MENU_UPDATED", "dining_menu", id, data(before), data(after));
        return after;
    }

    /**
     * La carta activa de cada producto en la sucursal: la del producto si la tiene, si no la de su categoría. Los
     * productos sin carta no aparecen en el mapa.
     */
    @Transactional(readOnly = true)
    public Map<UUID, Route> routes(UUID branchId, Collection<UUID> productIds) {
        Map<UUID, Route> result = new LinkedHashMap<>();
        if (productIds.isEmpty()) {
            return result;
        }
        for (Object[] r : dining.rows("""
                SELECT p.id, pm.id, pm.name, pr.id, pr.name, cm.id, cm.name, cr.id, cr.name
                FROM products p
                LEFT JOIN dining_menu_products mp ON mp.product_id = p.id AND mp.branch_id = :b
                LEFT JOIN dining_menus pm ON pm.id = mp.menu_id AND pm.active
                LEFT JOIN cash_registers pr ON pr.id = pm.cash_register_id
                LEFT JOIN dining_menu_categories mc ON mc.category_id = p.category_id AND mc.branch_id = :b
                LEFT JOIN dining_menus cm ON cm.id = mc.menu_id AND cm.active
                LEFT JOIN cash_registers cr ON cr.id = cm.cash_register_id
                WHERE p.id IN (:ids)""", Map.of("b", branchId, "ids", List.copyOf(productIds)))) {
            if (r[1] != null) {
                result.put((UUID) r[0], new Route((UUID) r[1], (String) r[2], (UUID) r[3], (String) r[4]));
            } else if (r[5] != null) {
                result.put((UUID) r[0], new Route((UUID) r[5], (String) r[6], (UUID) r[7], (String) r[8]));
            }
        }
        return result;
    }

    // ------------------------------------------------------------------ apoyo

    private MenuView menu(UUID id) {
        List<Object[]> found = dining.rows("SELECT branch_id, id FROM dining_menus WHERE id = :id", Map.of("id", id));
        if (found.isEmpty()) {
            throw new NotFoundException("Carta no encontrada.");
        }
        UUID branchId = (UUID) found.getFirst()[0];
        return menus(branchId).stream().filter(m -> m.id().equals(id)).findFirst()
                .orElseThrow(() -> new NotFoundException("Carta no encontrada."));
    }

    private static void requirePlan() {
        if (!CurrentActor.permissions().contains(PlanFeature.ZONE_REGISTERS.authority())) {
            throw new BusinessRuleException("Las cartas por piso están en el plan Empresa. Escríbenos para activarlas.");
        }
    }

    private void requireRegister(UUID branchId, UUID registerId) {
        if (registerId == null) {
            throw new BusinessRuleException("Elige en qué caja se cobra esta carta.");
        }
        List<Object[]> reg = dining.rows("SELECT branch_id, active FROM cash_registers WHERE id = :r", Map.of("r", registerId));
        if (reg.isEmpty()) {
            throw new NotFoundException("Caja no encontrada.");
        }
        if (!branchId.equals(reg.getFirst()[0])) {
            throw new BusinessRuleException("Esa caja es de otra sucursal.");
        }
        if (!Boolean.TRUE.equals(reg.getFirst()[1])) {
            throw new BusinessRuleException("Esa caja está inactiva.");
        }
    }

    private void writeAssignments(UUID branchId, UUID menuId, List<UUID> categoryIds, List<UUID> productIds) {
        em.createNativeQuery("DELETE FROM dining_menu_categories WHERE menu_id = ?1").setParameter(1, menuId)
                .executeUpdate();
        em.createNativeQuery("DELETE FROM dining_menu_products WHERE menu_id = ?1").setParameter(1, menuId)
                .executeUpdate();
        // Una categoría o un producto están en una sola carta de la sucursal: si estaban en otra, pasan a esta.
        for (UUID categoryId : categoryIds) {
            em.createNativeQuery("""
                    INSERT INTO dining_menu_categories (branch_id, category_id, menu_id) VALUES (?1, ?2, ?3)
                    ON CONFLICT (branch_id, category_id) DO UPDATE SET menu_id = excluded.menu_id""")
                    .setParameter(1, branchId).setParameter(2, categoryId).setParameter(3, menuId).executeUpdate();
        }
        for (UUID productId : productIds) {
            em.createNativeQuery("""
                    INSERT INTO dining_menu_products (branch_id, product_id, menu_id) VALUES (?1, ?2, ?3)
                    ON CONFLICT (branch_id, product_id) DO UPDATE SET menu_id = excluded.menu_id""")
                    .setParameter(1, branchId).setParameter(2, productId).setParameter(3, menuId).executeUpdate();
        }
    }

    private void requireAssignments(List<UUID> categoryIds, List<UUID> productIds) {
        if (categoryIds.size() + productIds.size() > MAX_ASSIGNED) {
            throw new BusinessRuleException("Máximo " + MAX_ASSIGNED + " productos y categorías por carta.");
        }
        requireExisting("categories", categoryIds, "Una de las categorías no existe.");
        requireExisting("products", productIds, "Uno de los productos no existe.");
    }

    private void requireExisting(String table, List<UUID> ids, String message) {
        if (!ids.isEmpty() && count("SELECT count(*) FROM " + table + " WHERE id IN (:ids)", Map.of("ids", ids)) != ids.size()) {
            throw new NotFoundException(message);
        }
    }

    private void requireUniqueName(UUID branchId, String name, UUID except) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("b", branchId);
        params.put("n", name);
        if (except != null) {
            params.put("x", except);
        }
        if (count("SELECT count(*) FROM dining_menus WHERE branch_id = :b AND lower(name) = lower(:n)"
                + (except == null ? "" : " AND id <> :x"), params) > 0) {
            throw new ConflictException("Ya hay una carta llamada " + name + ".");
        }
    }

    private static List<UUID> distinct(List<UUID> ids) {
        return ids == null ? List.of() : List.copyOf(new LinkedHashSet<>(ids.stream().filter(i -> i != null).toList()));
    }

    private Map<UUID, List<Ref>> refs(String sql, UUID branchId) {
        Map<UUID, List<Ref>> result = new LinkedHashMap<>();
        for (Object[] r : dining.rows(sql, Map.of("b", branchId))) {
            result.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new Ref((UUID) r[1], (String) r[2]));
        }
        return result;
    }

    private static Map<String, Object> data(MenuView m) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", m.name());
        data.put("cashRegister", m.cashRegister().name());
        data.put("active", m.active());
        data.put("categories", m.categories().stream().map(Ref::name).toList());
        data.put("products", m.products().stream().map(Ref::name).toList());
        return data;
    }

    private long count(String sql, Map<String, Object> params) {
        var query = em.createNativeQuery(sql);
        params.forEach(query::setParameter);
        return ((Number) query.getSingleResult()).longValue();
    }
}
