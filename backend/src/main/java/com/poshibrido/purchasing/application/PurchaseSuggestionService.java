package com.poshibrido.purchasing.application;

import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * "Qué comprar" (decisión 297): el pedido sugerido a cada proveedor, calculado con fórmula (sin IA) para una sucursal.
 * <ul>
 *   <li>Venta diaria = 60 % el promedio de los últimos 7 días + 40 % el de los últimos 30 (pesa más lo reciente).</li>
 *   <li>Existencia útil = existencia − lo que está en lotes ya vencidos.</li>
 *   <li>Sugerido = venta diaria × días del proveedor + mínimo − existencia útil, sin pasar del máximo, redondeado
 *       hacia arriba en la unidad base. Solo productos activos que controlan inventario y que se vendieron en 30 días o
 *       están en su mínimo.</li>
 *   <li>Proveedor = el de la última compra aceptada del producto; sin compras, "Sin proveedor".</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PurchaseSuggestionService {

    public static final int DEFAULT_DAYS = 15;
    static final BigDecimal RECENT_WEIGHT = new BigDecimal("0.6");
    static final BigDecimal MONTH_WEIGHT = new BigDecimal("0.4");

    private final BusinessSettingsApi settings;

    @PersistenceContext
    private EntityManager em;

    public record Line(UUID productId, String sku, String name, String unitCode, BigDecimal stock, BigDecimal minStock,
                       BigDecimal maxStock, BigDecimal soldLast7, BigDecimal soldLast30, BigDecimal dailyAverage,
                       BigDecimal expired, BigDecimal expiringSoon, BigDecimal suggested, BigDecimal unitCost,
                       BigDecimal estimatedTotal, LocalDate lastPurchase) {
    }

    /** Lo sugerido para un proveedor ({@code supplierId} nulo = productos sin compras registradas). */
    public record Group(UUID supplierId, String supplierName, String phone, int coverageDays, List<Line> lines,
                        BigDecimal estimatedTotal) {
    }

    public record Suggestions(UUID branchId, LocalDate date, List<Group> groups) {
    }

    @Transactional(readOnly = true)
    public Suggestions suggestions(UUID branchId) {
        if (branchId == null) {
            throw new BusinessRuleException("Elige la sucursal.");
        }
        Number exists = (Number) em.createNativeQuery("SELECT count(*) FROM branches WHERE id = ?1 AND active")
                .setParameter(1, branchId).getSingleResult();
        if (exists.intValue() == 0) {
            throw new NotFoundException("Sucursal no encontrada.");
        }
        ZoneId zone = ZoneId.of(settings.current().timezone());
        LocalDate today = LocalDate.now(zone);
        Instant d30 = today.minusDays(30).atStartOfDay(zone).toInstant();
        Instant d7 = today.minusDays(7).atStartOfDay(zone).toInstant();
        Map<UUID, Integer> days = coverageDays();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
                WITH sold AS (
                    SELECT si.product_id,
                           sum(si.base_quantity) AS q30,
                           coalesce(sum(si.base_quantity) FILTER (WHERE s.created_at >= ?3), 0) AS q7
                    FROM sale_items si JOIN sales s ON s.id = si.sale_id
                    WHERE s.status = 'COMPLETED' AND s.branch_id = ?1 AND s.created_at >= ?2
                    GROUP BY si.product_id),
                last_buy AS (
                    SELECT DISTINCT ON (l.product_id) l.product_id, r.supplier_id, r.received_at
                    FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id = l.receipt_id
                    WHERE l.status = 'ACCEPTED'
                    ORDER BY l.product_id, r.received_at DESC),
                lot_qty AS (
                    SELECT b.product_id,
                           coalesce(sum(b.quantity) FILTER (WHERE lo.expiration_date < ?4), 0) AS expired,
                           coalesce(sum(b.quantity) FILTER (WHERE lo.expiration_date >= ?4
                                                           AND lo.expiration_date < ?5), 0) AS expiring
                    FROM lot_balances b JOIN lots lo ON lo.id = b.lot_id
                    WHERE b.branch_id = ?1 AND b.quantity > 0
                    GROUP BY b.product_id)
                SELECT p.id, p.sku, p.name, u.code, coalesce(b.quantity, 0), b.min_stock, b.max_stock,
                       coalesce(sold.q7, 0), coalesce(sold.q30, 0), coalesce(lq.expired, 0), coalesce(lq.expiring, 0),
                       p.cost, lb.supplier_id, lb.received_at,
                       coalesce(pa.business_name, trim(coalesce(pa.first_names, '') || ' ' || coalesce(pa.last_names, ''))),
                       pa.phone
                FROM products p
                JOIN units u ON u.id = p.base_unit_id
                LEFT JOIN stock_balances b ON b.product_id = p.id AND b.branch_id = ?1 AND b.lot_id IS NULL
                LEFT JOIN sold ON sold.product_id = p.id
                LEFT JOIN lot_qty lq ON lq.product_id = p.id
                LEFT JOIN last_buy lb ON lb.product_id = p.id
                LEFT JOIN parties pa ON pa.id = lb.supplier_id
                WHERE p.active AND p.track_inventory
                  AND (sold.q30 > 0 OR (b.min_stock IS NOT NULL AND coalesce(b.quantity, 0) <= b.min_stock))
                ORDER BY p.name""")
                .setParameter(1, branchId).setParameter(2, Timestamp.from(d30)).setParameter(3, Timestamp.from(d7))
                .setParameter(4, Date.valueOf(today)).setParameter(5, Date.valueOf(today.plusDays(60)))
                .getResultList();
        Map<UUID, List<Line>> bySupplier = new LinkedHashMap<>();
        Map<UUID, String[]> supplierInfo = new HashMap<>();
        UUID none = new UUID(0, 0);
        for (Object[] r : rows) {
            UUID supplierId = (UUID) r[12];
            int coverage = supplierId == null ? DEFAULT_DAYS : days.getOrDefault(supplierId, DEFAULT_DAYS);
            Line line = line(r, coverage, zone);
            if (line.suggested().signum() <= 0) {
                continue;
            }
            UUID key = supplierId == null ? none : supplierId;
            bySupplier.computeIfAbsent(key, k -> new ArrayList<>()).add(line);
            if (supplierId != null) {
                supplierInfo.put(supplierId, new String[]{(String) r[14], (String) r[15]});
            }
        }
        List<Group> groups = new ArrayList<>();
        for (var e : bySupplier.entrySet()) {
            UUID id = none.equals(e.getKey()) ? null : e.getKey();
            String[] info = id == null ? new String[]{"Sin proveedor", null} : supplierInfo.get(id);
            BigDecimal total = e.getValue().stream().map(Line::estimatedTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
            groups.add(new Group(id, info[0], info[1], id == null ? DEFAULT_DAYS : days.getOrDefault(id, DEFAULT_DAYS),
                    e.getValue(), total));
        }
        groups.sort(Comparator.comparing((Group g) -> g.supplierId() == null)
                .thenComparing(Group::estimatedTotal, Comparator.reverseOrder()));
        return new Suggestions(branchId, today, groups);
    }

    /** Una línea con su cálculo. */
    static Line line(Object[] r, int coverageDays, ZoneId zone) {
        BigDecimal stock = dec(r[4]);
        BigDecimal min = r[5] == null ? null : dec(r[5]);
        BigDecimal max = r[6] == null ? null : dec(r[6]);
        BigDecimal q7 = dec(r[7]);
        BigDecimal q30 = dec(r[8]);
        BigDecimal expired = dec(r[9]);
        BigDecimal cost = dec(r[11]);
        BigDecimal daily = dailyAverage(q7, q30);
        BigDecimal suggested = suggested(daily, coverageDays, stock.subtract(expired), min, max);
        LocalDate lastPurchase = r[13] == null ? null : toInstant(r[13]).atZone(zone).toLocalDate();
        return new Line((UUID) r[0], (String) r[1], (String) r[2], (String) r[3], stock, min, max, q7, q30, daily,
                expired, dec(r[10]), suggested, cost, suggested.multiply(cost).setScale(0, RoundingMode.HALF_UP),
                lastPurchase);
    }

    static BigDecimal dailyAverage(BigDecimal q7, BigDecimal q30) {
        BigDecimal recent = q7.divide(BigDecimal.valueOf(7), 6, RoundingMode.HALF_UP);
        BigDecimal month = q30.divide(BigDecimal.valueOf(30), 6, RoundingMode.HALF_UP);
        return recent.multiply(RECENT_WEIGHT).add(month.multiply(MONTH_WEIGHT)).setScale(3, RoundingMode.HALF_UP);
    }

    /** venta diaria × días + mínimo − existencia útil, sin pasar del máximo; hacia arriba, nunca negativo. */
    static BigDecimal suggested(BigDecimal daily, int days, BigDecimal usable, BigDecimal min, BigDecimal max) {
        BigDecimal need = daily.multiply(BigDecimal.valueOf(days)).add(min == null ? BigDecimal.ZERO : min)
                .subtract(usable);
        if (max != null) {
            need = need.min(max.subtract(usable));
        }
        return need.signum() <= 0 ? BigDecimal.ZERO : need.setScale(0, RoundingMode.CEILING);
    }

    // ------------------------------------------------------------------ días por proveedor

    private Map<UUID, Integer> coverageDays() {
        Map<UUID, Integer> map = new HashMap<>();
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("SELECT supplier_id, coverage_days FROM supplier_order_settings")
                .getResultList();
        for (Object[] r : rows) {
            map.put((UUID) r[0], ((Number) r[1]).intValue());
        }
        return map;
    }

    @Transactional
    public void setCoverageDays(UUID supplierId, int days) {
        if (days < 1 || days > 120) {
            throw new BusinessRuleException("Los días van de 1 a 120.");
        }
        Number exists = (Number) em.createNativeQuery("SELECT count(*) FROM suppliers WHERE party_id = ?1")
                .setParameter(1, supplierId).getSingleResult();
        if (exists.intValue() == 0) {
            throw new NotFoundException("Proveedor no encontrado.");
        }
        em.createNativeQuery("""
                INSERT INTO supplier_order_settings (supplier_id, coverage_days, updated_at, updated_by)
                VALUES (?1, ?2, ?3, ?4)
                ON CONFLICT (supplier_id) DO UPDATE SET coverage_days = excluded.coverage_days,
                    updated_at = excluded.updated_at, updated_by = excluded.updated_by""")
                .setParameter(1, supplierId).setParameter(2, days).setParameter(3, Timestamp.from(Instant.now()))
                .setParameter(4, CurrentActor.requireUserId()).executeUpdate();
    }

    // ------------------------------------------------------------------ apoyo

    private static BigDecimal dec(Object o) {
        if (o == null) {
            return BigDecimal.ZERO;
        }
        return o instanceof BigDecimal b ? b : new BigDecimal(o.toString());
    }

    private static Instant toInstant(Object o) {
        if (o instanceof Instant i) {
            return i;
        }
        if (o instanceof Timestamp t) {
            return t.toInstant();
        }
        if (o instanceof java.time.OffsetDateTime odt) {
            return odt.toInstant();
        }
        return Instant.parse(o.toString());
    }
}
