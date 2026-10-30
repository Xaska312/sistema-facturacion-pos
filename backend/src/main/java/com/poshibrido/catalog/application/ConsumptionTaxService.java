package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.TaxType;
import com.poshibrido.catalog.infrastructure.TaxRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Asistente del impuesto al consumo (Fase 12b-5, decisión 272): un restaurante responsable de INC cobra el 8 % en
 * lugar del IVA en las comidas y bebidas que prepara. Deja el impuesto "INC 8 %" creado y activo, y lo asigna a todos
 * los productos de las categorías elegidas (también los de sus subcategorías). Las ventas anteriores no cambian. Con
 * los precios con impuesto incluido (lo normal), el precio de venta sigue igual: cambia cómo se reparte la base y el
 * impuesto.
 */
@Service
@RequiredArgsConstructor
public class ConsumptionTaxService {

    static final String CODE = "INC8";
    static final BigDecimal RATE = new BigDecimal("8.00");
    static final int MAX_CATEGORIES = 100;

    private final TaxRepository taxes;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record Result(UUID taxId, String taxName, int categories, int products) {
    }

    @Transactional
    public Result apply(List<UUID> categoryIds) {
        List<UUID> ids = categoryIds == null ? List.of() : List.copyOf(new LinkedHashSet<>(categoryIds));
        if (ids.isEmpty() || ids.size() > MAX_CATEGORIES) {
            throw new BusinessRuleException("Elige las categorías de comidas y bebidas preparadas (máximo "
                    + MAX_CATEGORIES + ").");
        }
        long found = ((Number) em.createNativeQuery("SELECT count(*) FROM categories WHERE id IN (:ids)")
                .setParameter("ids", ids).getSingleResult()).longValue();
        if (found != ids.size()) {
            throw new NotFoundException("Una de las categorías no existe.");
        }
        Tax tax = taxes.findAll().stream()
                .filter(t -> t.getType() == TaxType.INC && t.getRate().compareTo(RATE) == 0)
                .findFirst()
                .orElseGet(() -> {
                    Tax created = taxes.save(Tax.create(taxes.existsByCode(CODE) ? CODE + "_R" : CODE, "INC 8 %",
                            TaxType.INC, RATE));
                    audit.log("TAX_CREATED", "tax", created.getId(), null,
                            Map.of("code", created.getCode(), "type", TaxType.INC, "rate", RATE));
                    return created;
                });
        if (!tax.isActive()) {
            tax.setActive(true);
            audit.log("TAX_ACTIVATED", "tax", tax.getId(), null, null);
        }
        taxes.flush();
        int updated = em.createNativeQuery("""
                WITH RECURSIVE tree AS (
                    SELECT id FROM categories WHERE id IN (:ids)
                    UNION
                    SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
                )
                UPDATE products SET tax_id = :tax, updated_at = now(), version = version + 1
                WHERE category_id IN (SELECT id FROM tree) AND tax_id <> :tax""")
                .setParameter("ids", ids).setParameter("tax", tax.getId()).executeUpdate();
        em.clear();
        @SuppressWarnings("unchecked")
        List<String> names = em.createNativeQuery("SELECT name FROM categories WHERE id IN (:ids) ORDER BY name")
                .setParameter("ids", ids).getResultList();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("tax", tax.getName());
        data.put("categories", names);
        data.put("products", updated);
        audit.log("CONSUMPTION_TAX_APPLIED", "tax", tax.getId(), null, data);
        return new Result(tax.getId(), tax.getName(), ids.size(), updated);
    }
}
