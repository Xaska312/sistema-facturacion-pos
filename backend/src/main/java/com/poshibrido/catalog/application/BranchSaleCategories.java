package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Qué vende cada sucursal (decisión 378). Por defecto todo el catálogo; si no, solo los productos de las categorías
 * elegidas y de sus subcategorías. El catálogo y los precios son uno solo para el negocio: esto solo decide qué se
 * ofrece en Vender, en la búsqueda, en el lector y en Mesas de esa sucursal.
 */
@Service
@RequiredArgsConstructor
public class BranchSaleCategories {

    static final int MAX_CATEGORIES = 200;

    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    /**
     * {@code categoryIds}: las elegidas (para editarlas). {@code allowedIds}: esas más sus subcategorías, o nulo si
     * la sucursal vende todo.
     */
    public record SaleCategories(UUID branchId, boolean sellsAll, List<UUID> categoryIds, List<UUID> allowedIds) {
    }

    @Transactional(readOnly = true)
    public SaleCategories get(UUID branchId) {
        Boolean sellsAll = sellsAll(branchId);
        List<UUID> chosen = chosen(branchId);
        // Si se borraron todas sus categorías, vuelve a vender todo (no queda una sucursal sin nada que vender).
        if (sellsAll || chosen.isEmpty()) {
            return new SaleCategories(branchId, true, chosen, null);
        }
        return new SaleCategories(branchId, false, chosen, List.copyOf(withDescendants(chosen)));
    }

    /** Las categorías que puede vender la sucursal, con sus subcategorías; vacío si vende todo. */
    @Transactional(readOnly = true)
    public Optional<Set<UUID>> allowed(UUID branchId) {
        if (branchId == null) {
            return Optional.empty();
        }
        SaleCategories sale = get(branchId);
        return sale.sellsAll() ? Optional.empty() : Optional.of(Set.copyOf(sale.allowedIds()));
    }

    /** El lector de Vender: un producto que la sucursal no vende no se agrega (decisión 378). */
    @Transactional(readOnly = true)
    public void requireSells(UUID branchId, UUID productId) {
        Optional<Set<UUID>> allowed = allowed(branchId);
        if (allowed.isEmpty() || productId == null) {
            return;
        }
        List<?> rows = em.createNativeQuery(
                        "SELECT p.name, p.category_id, b.name FROM products p, branches b WHERE p.id = ?1 AND b.id = ?2")
                .setParameter(1, productId).setParameter(2, branchId).getResultList();
        if (rows.isEmpty()) {
            return;
        }
        Object[] r = (Object[]) rows.getFirst();
        if (r[1] == null || !allowed.get().contains((UUID) r[1])) {
            throw new BusinessRuleException(r[0] + " no se vende en " + r[2]
                    + ". Si sí se vende allí, agrega su categoría en Sucursales › Editar.");
        }
    }

    @Transactional
    public SaleCategories set(UUID branchId, boolean sellsAll, List<UUID> categoryIds) {
        SaleCategories before = get(branchId);
        Set<UUID> ids = categoryIds == null ? Set.of() : new LinkedHashSet<>(categoryIds);
        if (!sellsAll && ids.isEmpty()) {
            throw new BusinessRuleException("Elige al menos una categoría que se venda en esta sucursal.");
        }
        if (ids.size() > MAX_CATEGORIES) {
            throw new BusinessRuleException("Máximo " + MAX_CATEGORIES + " categorías por sucursal.");
        }
        if (!ids.isEmpty()) {
            Number found = (Number) em.createNativeQuery("SELECT count(*) FROM categories WHERE id IN (:ids)")
                    .setParameter("ids", ids).getSingleResult();
            if (found.intValue() != ids.size()) {
                throw new BusinessRuleException("Alguna de las categorías elegidas ya no existe.");
            }
        }
        em.createNativeQuery("UPDATE branches SET sells_all = ?1 WHERE id = ?2")
                .setParameter(1, sellsAll).setParameter(2, branchId).executeUpdate();
        em.createNativeQuery("DELETE FROM branch_categories WHERE branch_id = ?1").setParameter(1, branchId)
                .executeUpdate();
        if (!sellsAll) {
            for (UUID id : ids) {
                em.createNativeQuery("INSERT INTO branch_categories (branch_id, category_id) VALUES (?1, ?2)")
                        .setParameter(1, branchId).setParameter(2, id).executeUpdate();
            }
        }
        SaleCategories after = get(branchId);
        audit.log("BRANCH_SALE_CATEGORIES_CHANGED", "branch", branchId, data(before), data(after));
        return after;
    }

    private Boolean sellsAll(UUID branchId) {
        List<?> rows = em.createNativeQuery("SELECT sells_all FROM branches WHERE id = ?1").setParameter(1, branchId)
                .getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Sucursal no encontrada.");
        }
        return (Boolean) rows.getFirst();
    }

    private List<UUID> chosen(UUID branchId) {
        List<UUID> result = new ArrayList<>();
        for (Object id : em.createNativeQuery("""
                SELECT bc.category_id FROM branch_categories bc JOIN categories c ON c.id = bc.category_id
                WHERE bc.branch_id = ?1 ORDER BY lower(c.name)""").setParameter(1, branchId).getResultList()) {
            result.add((UUID) id);
        }
        return result;
    }

    /** Las elegidas y todas sus subcategorías (el árbol de categorías es corto: se recorre en memoria). */
    private Set<UUID> withDescendants(List<UUID> roots) {
        Map<UUID, List<UUID>> children = new HashMap<>();
        for (Object row : em.createNativeQuery("SELECT id, parent_id FROM categories WHERE parent_id IS NOT NULL")
                .getResultList()) {
            Object[] r = (Object[]) row;
            children.computeIfAbsent((UUID) r[1], k -> new ArrayList<>()).add((UUID) r[0]);
        }
        Set<UUID> result = new LinkedHashSet<>();
        List<UUID> pending = new ArrayList<>(roots);
        while (!pending.isEmpty()) {
            UUID id = pending.removeLast();
            if (result.add(id)) {
                pending.addAll(children.getOrDefault(id, List.of()));
            }
        }
        return result;
    }

    private static Map<String, Object> data(SaleCategories s) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("sellsAll", s.sellsAll());
        data.put("categoryIds", s.categoryIds());
        return data;
    }
}
