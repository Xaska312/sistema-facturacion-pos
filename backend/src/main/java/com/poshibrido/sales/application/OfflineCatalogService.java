package com.poshibrido.sales.application;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Copia del catálogo para vender sin internet (decisión 332): cada producto activo en cada presentación con su precio
 * general (el del consumidor final), impuesto y los códigos que lo encuentran (SKU y códigos de barras). No trae los
 * medicamentos bajo fórmula: esos piden sus datos y se venden con conexión.
 */
@Service
public class OfflineCatalogService {

    @PersistenceContext
    private EntityManager em;

    public record Item(UUID productId, String sku, String name, UUID unitId, String unitCode, BigDecimal factor,
                       BigDecimal price, UUID taxId, String taxType, BigDecimal taxRate, boolean trackInventory,
                       boolean openPrice, boolean allowsDecimals, List<String> codes) {
    }

    public record Catalog(Instant generatedAt, List<Item> items) {
    }

    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public Catalog current() {
        List<Object[]> products = em.createNativeQuery("""
                SELECT p.id, p.sku, p.name, p.base_unit_id, u.code, u.allows_decimals, p.sale_price, t.id, t.type,
                       t.rate, p.track_inventory, p.open_price
                FROM products p
                JOIN units u ON u.id = p.base_unit_id
                JOIN taxes t ON t.id = p.tax_id
                WHERE p.active AND p.deleted_at IS NULL
                  AND NOT EXISTS (SELECT 1 FROM product_medicines m WHERE m.product_id = p.id
                                  AND m.sale_condition IN ('PRESCRIPTION', 'CONTROLLED', 'STATE_MONOPOLY'))
                ORDER BY p.name""").getResultList();
        List<Object[]> conversions = em.createNativeQuery("""
                SELECT c.product_id, c.unit_id, u.code, c.factor, c.sale_price
                FROM product_unit_conversions c JOIN units u ON u.id = c.unit_id""").getResultList();
        List<Object[]> barcodes = em.createNativeQuery(
                "SELECT product_id, unit_id, barcode FROM product_barcodes").getResultList();

        Map<UUID, List<Object[]>> conversionsByProduct = new HashMap<>();
        for (Object[] c : conversions) {
            conversionsByProduct.computeIfAbsent((UUID) c[0], k -> new ArrayList<>()).add(c);
        }
        // Códigos de barras por producto y presentación (sin presentación = la unidad base).
        Map<UUID, Map<UUID, List<String>>> codes = new HashMap<>();
        for (Object[] b : barcodes) {
            codes.computeIfAbsent((UUID) b[0], k -> new LinkedHashMap<>())
                    .computeIfAbsent((UUID) b[1], k -> new ArrayList<>()).add((String) b[2]);
        }

        List<Item> items = new ArrayList<>();
        for (Object[] p : products) {
            UUID id = (UUID) p[0];
            String sku = (String) p[1];
            UUID baseUnit = (UUID) p[3];
            BigDecimal basePrice = (BigDecimal) p[6];
            Map<UUID, List<String>> productCodes = codes.getOrDefault(id, java.util.Collections.emptyMap());
            List<String> baseCodes = new ArrayList<>();
            baseCodes.add(sku);
            baseCodes.addAll(productCodes.getOrDefault(baseUnit, List.of()));
            baseCodes.addAll(productCodes.getOrDefault(null, List.of()));
            items.add(new Item(id, sku, (String) p[2], baseUnit, (String) p[4], BigDecimal.ONE, basePrice,
                    (UUID) p[7], (String) p[8], (BigDecimal) p[9], (Boolean) p[10], (Boolean) p[11],
                    (Boolean) p[5], baseCodes));
            for (Object[] c : conversionsByProduct.getOrDefault(id, List.of())) {
                UUID unit = (UUID) c[1];
                BigDecimal factor = (BigDecimal) c[3];
                BigDecimal price = c[4] != null ? (BigDecimal) c[4]
                        : basePrice.multiply(factor).setScale(2, RoundingMode.HALF_UP);
                items.add(new Item(id, sku, (String) p[2], unit, (String) c[2], factor, price, (UUID) p[7],
                        (String) p[8], (BigDecimal) p[9], (Boolean) p[10], (Boolean) p[11], (Boolean) p[5],
                        productCodes.getOrDefault(unit, List.of())));
            }
        }
        return new Catalog(Instant.now(), items);
    }
}
