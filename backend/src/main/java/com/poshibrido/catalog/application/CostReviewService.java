package com.poshibrido.catalog.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.domain.Product;
import com.poshibrido.catalog.infrastructure.ProductRepository;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.error.BusinessRuleException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Revisar costos escritos con IVA (decisión 349). Antes de la 348 el costo del producto se escribía "como te cuesta",
 * casi siempre con IVA, pero la app lo usa sin IVA: la utilidad quedaba corta. Aquí se listan los productos con IVA y
 * costo para que el dueño marque los que traían el IVA, y al corregirlos se les quita a su costo y al de sus ventas.
 */
@Service
@RequiredArgsConstructor
public class CostReviewService {

    static final int MAX_FIX = 500;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final ProductRepository products;
    private final StockPresence stock;
    private final AuditLogger audit;
    private final BusinessSettingsApi settings;

    @PersistenceContext
    private EntityManager em;

    /**
     * Producto por revisar. {@code marginNow}: margen con el costo guardado; {@code marginFixed}: si se le quita el IVA.
     * {@code purchased}: tiene compras registradas (esas ya traían el costo sin IVA). {@code suspicious}: el margen de
     * ahora es muy bajo (menos del 5 %) y quitándole el IVA queda normal.
     */
    public record Row(UUID productId, String sku, String name, BigDecimal taxRate, BigDecimal cost,
                      BigDecimal costWithoutTax, BigDecimal salePrice, BigDecimal marginNow, BigDecimal marginFixed,
                      long soldLines, boolean purchased, boolean suspicious) {
    }

    public record Fixed(int products, long saleLines) {
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public List<Row> review() {
        boolean pricesIncludeTax = settings.current().pricesIncludeTax();
        List<Object[]> rows = em.createNativeQuery("""
                SELECT p.id, p.sku, p.name, t.rate, p.cost, p.sale_price,
                       (SELECT count(*) FROM sale_items si WHERE si.product_id = p.id) AS sold,
                       EXISTS (SELECT 1 FROM purchase_receipt_lines l WHERE l.product_id = p.id) AS purchased
                FROM products p JOIN taxes t ON t.id = p.tax_id
                WHERE p.deleted_at IS NULL AND p.active AND t.rate > 0 AND p.cost > 0 AND NOT p.open_price
                ORDER BY p.name
                """).getResultList();
        List<Row> result = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            BigDecimal rate = (BigDecimal) r[3];
            BigDecimal cost = (BigDecimal) r[4];
            BigDecimal price = (BigDecimal) r[5];
            BigDecimal fixed = withoutTax(cost, rate);
            BigDecimal netPrice = pricesIncludeTax ? withoutTax(price, rate) : price;
            BigDecimal now = margin(netPrice, cost);
            BigDecimal after = margin(netPrice, fixed);
            boolean suspicious = now != null && after != null && now.compareTo(BigDecimal.valueOf(5)) < 0
                    && after.signum() > 0;
            result.add(new Row((UUID) r[0], (String) r[1], (String) r[2], rate, cost, fixed, price, now, after,
                    ((Number) r[6]).longValue(), (Boolean) r[7], suspicious));
        }
        return result;
    }

    /**
     * Le quita el IVA al costo de los productos elegidos y al de sus ventas ya hechas (las líneas de venta siguen
     * inmutables salvo el costo, y solo en esta transacción). Con costo manejado por el inventario queda el renglón
     * "Cambio de costo" en el kardex. Auditoría: {@code PRODUCT_COST_TAX_REMOVED} por producto.
     */
    @Transactional
    public Fixed removeTax(Set<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new BusinessRuleException("Elige los productos cuyo costo traía el IVA.");
        }
        if (productIds.size() > MAX_FIX) {
            throw new BusinessRuleException("Corrige hasta " + MAX_FIX + " productos a la vez.");
        }
        em.createNativeQuery("SET LOCAL xaska.cost_correction = 'on'").executeUpdate();
        int count = 0;
        long lines = 0;
        for (UUID id : productIds) {
            Product product = products.findById(id).filter(p -> p.getDeletedAt() == null).orElse(null);
            if (product == null) {
                continue;
            }
            BigDecimal rate = (BigDecimal) em.createNativeQuery("SELECT rate FROM taxes WHERE id = ?1")
                    .setParameter(1, product.getTaxId()).getSingleResult();
            if (rate == null || rate.signum() <= 0 || product.getCost().signum() <= 0) {
                continue;
            }
            BigDecimal before = product.getCost();
            BigDecimal after = withoutTax(before, rate);
            product.correctCost(after);
            if (product.isCostLocked()) {
                stock.recordCostChange(id, before, after,
                        ProductService.costReason("al quitarle el IVA", before, after));
            }
            int updated = em.createNativeQuery("""
                    UPDATE sale_items SET unit_cost = round(unit_cost / (1 + tax_rate / 100), 2)
                    WHERE product_id = ?1 AND tax_rate > 0 AND unit_cost > 0
                    """).setParameter(1, id).executeUpdate();
            lines += updated;
            count++;
            Map<String, Object> was = new LinkedHashMap<>();
            was.put("cost", before);
            Map<String, Object> now = new LinkedHashMap<>();
            now.put("cost", after);
            now.put("taxRate", rate);
            now.put("saleLines", updated);
            audit.log("PRODUCT_COST_TAX_REMOVED", "product", id, was, now);
        }
        return new Fixed(count, lines);
    }

    static BigDecimal withoutTax(BigDecimal value, BigDecimal rate) {
        return value.divide(BigDecimal.ONE.add(rate.divide(HUNDRED, 6, RoundingMode.HALF_UP)), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal margin(BigDecimal netPrice, BigDecimal cost) {
        if (netPrice.signum() <= 0) {
            return null;
        }
        return netPrice.subtract(cost).multiply(HUNDRED).divide(netPrice, 1, RoundingMode.HALF_UP);
    }
}
