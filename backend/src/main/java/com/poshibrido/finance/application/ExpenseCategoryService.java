package com.poshibrido.finance.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.finance.application.ExpenseViews.CategoryView;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Categorías de gasto del negocio (decisión 320). Vienen unas de fábrica; se renombran, se agregan y se apagan. No se
 * borran: una apagada deja de ofrecerse y los gastos que la usaron la conservan.
 */
@Service
@RequiredArgsConstructor
public class ExpenseCategoryService {

    static final int MAX_CATEGORIES = 60;

    @PersistenceContext
    private EntityManager em;

    private final AuditLogger audit;

    @Transactional(readOnly = true)
    public List<CategoryView> list(boolean includeInactive) {
        List<CategoryView> result = new ArrayList<>();
        for (Object row : em.createNativeQuery("SELECT id, name, active, sort_order FROM expense_categories"
                + (includeInactive ? "" : " WHERE active") + " ORDER BY sort_order, lower(name)").getResultList()) {
            result.add(view((Object[]) row));
        }
        return result;
    }

    @Transactional
    public CategoryView create(String name) {
        String clean = name(name);
        requireFree(clean, null);
        long count = ((Number) em.createNativeQuery("SELECT count(*) FROM expense_categories").getSingleResult())
                .longValue();
        if (count >= MAX_CATEGORIES) {
            throw new BusinessRuleException("Ya hay " + MAX_CATEGORIES + " categorías. Renombra o reutiliza una.");
        }
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO expense_categories (id, name, sort_order)
                VALUES (?1, ?2, (SELECT coalesce(max(sort_order), 0) + 1 FROM expense_categories))""")
                .setParameter(1, id).setParameter(2, clean).executeUpdate();
        CategoryView view = get(id);
        audit.log("EXPENSE_CATEGORY_CREATED", "expense_category", id, null, data(view));
        return view;
    }

    @Transactional
    public CategoryView update(UUID id, String name, Boolean active) {
        CategoryView before = get(id);
        String clean = name == null ? before.name() : name(name);
        boolean on = active == null ? before.active() : active;
        if (!clean.equalsIgnoreCase(before.name())) {
            requireFree(clean, id);
        }
        em.createNativeQuery("UPDATE expense_categories SET name = ?2, active = ?3, updated_at = now() WHERE id = ?1")
                .setParameter(1, id).setParameter(2, clean).setParameter(3, on).executeUpdate();
        CategoryView after = get(id);
        audit.log("EXPENSE_CATEGORY_UPDATED", "expense_category", id, data(before), data(after));
        return after;
    }

    private CategoryView get(UUID id) {
        List<?> found = em.createNativeQuery("SELECT id, name, active, sort_order FROM expense_categories WHERE id = ?1")
                .setParameter(1, id).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Categoría no encontrada.");
        }
        return view((Object[]) found.getFirst());
    }

    private void requireFree(String name, UUID except) {
        List<?> same = em.createNativeQuery("SELECT id FROM expense_categories WHERE lower(name) = lower(?1)")
                .setParameter(1, name).getResultList();
        if (!same.isEmpty() && !same.getFirst().equals(except)) {
            throw new ConflictException("Ya hay una categoría con ese nombre.");
        }
    }

    private static String name(String raw) {
        String v = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (v.isEmpty()) {
            throw new BusinessRuleException("Escribe el nombre de la categoría.");
        }
        if (v.length() > 60) {
            throw new BusinessRuleException("El nombre de la categoría es muy largo (máximo 60 letras).");
        }
        if (v.equalsIgnoreCase(ExpenseService.UNCLASSIFIED)) {
            throw new BusinessRuleException("\"Sin clasificar\" es el nombre de los egresos sin categoría. Usa otro.");
        }
        return v;
    }

    private static CategoryView view(Object[] r) {
        return new CategoryView((UUID) r[0], (String) r[1], Boolean.TRUE.equals(r[2]), ((Number) r[3]).intValue());
    }

    private static Map<String, Object> data(CategoryView c) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", c.name());
        data.put("active", c.active());
        return data;
    }
}
