package com.poshibrido.inventory.application;

import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Consultas de lotes y vencimientos (Fase 13-3, decisión 281): qué está vencido o por vencer (con la anticipación de
 * Ajustes), los lotes de un producto en una sucursal, lo que aún no tiene lote y la trazabilidad de un lote (de quién
 * se compró y a quién se vendió), que es lo que se necesita ante una alerta sanitaria del INVIMA.
 */
@Service
@RequiredArgsConstructor
public class LotQueryService {

    public enum LotStatus {
        EXPIRED, EXPIRING, OK
    }

    public record LotRow(UUID branchId, String branchName, UUID productId, String sku, String name, String unitCode,
                         UUID lotId, String lotNumber, LocalDate expirationDate, BigDecimal quantity,
                         BigDecimal value, Long daysLeft, LotStatus status) {
    }

    public record LotSummary(int alertMonths, long expiredLots, BigDecimal expiredValue, long expiringLots,
                             BigDecimal expiringValue, long unlottedProducts) {
    }

    public record UnlottedRow(UUID branchId, String branchName, UUID productId, String sku, String name,
                              String unitCode, BigDecimal quantity) {
    }

    /** Lotes de un producto en una sucursal (FEFO: el que vence primero arriba) y lo que no tiene lote. */
    public record ProductLots(UUID productId, UUID branchId, BigDecimal unlotted, List<LotRow> lots) {
    }

    public record TraceEntry(Instant at, String branchName, String type, BigDecimal quantity, String document,
                             String party, String reason) {
    }

    public record LotTrace(UUID productId, String sku, String name, String unitCode, String lotNumber,
                           LocalDate expirationDate, BigDecimal onHand, BigDecimal received, BigDecimal sold,
                           List<TraceEntry> entries) {
    }

    @PersistenceContext
    private EntityManager em;

    private final BusinessSettingsApi settings;

    private static final String LOT_SQL = """
            SELECT b.branch_id, br.name, p.id, p.sku, p.name, u.code, l.id, l.lot_number, l.expiration_date,
                   b.quantity, round(b.quantity * p.cost, 2)
            FROM lot_balances b
            JOIN lots l ON l.id = b.lot_id
            JOIN products p ON p.id = b.product_id
            JOIN units u ON u.id = p.base_unit_id
            JOIN branches br ON br.id = b.branch_id
            WHERE b.quantity > 0""";

    /**
     * Lotes con existencia. {@code status}: EXPIRED (vence hoy o antes), EXPIRING (dentro de los meses de aviso), OK o
     * nulo (todos). Los que vencen primero arriba.
     */
    @Transactional(readOnly = true)
    public PageResponse<LotRow> lots(UUID branchId, LotStatus status, String search, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 200);
        LocalDate today = today();
        LocalDate limit = today.plusMonths(alertMonths());
        StringBuilder where = new StringBuilder();
        Map<String, Object> params = new HashMap<>();
        if (branchId != null) {
            where.append(" AND b.branch_id = :branch");
            params.put("branch", branchId);
        }
        if (status == LotStatus.EXPIRED) {
            where.append(" AND l.expiration_date <= :today");
            params.put("today", today);
        } else if (status == LotStatus.EXPIRING) {
            where.append(" AND l.expiration_date > :today AND l.expiration_date <= :limit");
            params.put("today", today);
            params.put("limit", limit);
        } else if (status == LotStatus.OK) {
            where.append(" AND (l.expiration_date IS NULL OR l.expiration_date > :limit)");
            params.put("limit", limit);
        }
        if (search != null && !search.isBlank()) {
            where.append(" AND (lower(p.name) LIKE :q OR lower(p.sku) LIKE :q OR lower(l.lot_number) LIKE :q)");
            params.put("q", "%" + search.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%");
        }
        long total = ((Number) query("SELECT count(*) FROM (" + LOT_SQL + where + ") x", params).getSingleResult())
                .longValue();
        List<LotRow> rows = new ArrayList<>();
        for (Object o : query(LOT_SQL + where + " ORDER BY l.expiration_date NULLS LAST, p.name, l.lot_number LIMIT "
                + s + " OFFSET " + ((long) p * s), params).getResultList()) {
            rows.add(row((Object[]) o, today, limit));
        }
        return new PageResponse<>(rows, p, s, total, (int) ((total + s - 1) / s));
    }

    /** Cuántos lotes están vencidos y por vencer (y cuánto valen al costo promedio), y productos con existencia sin lote. */
    @Transactional(readOnly = true)
    public LotSummary summary(UUID branchId) {
        int months = alertMonths();
        LocalDate today = today();
        Map<String, Object> params = new HashMap<>();
        params.put("today", today);
        params.put("limit", today.plusMonths(months));
        String branch = "";
        if (branchId != null) {
            branch = " AND b.branch_id = :branch";
            params.put("branch", branchId);
        }
        Object[] r = (Object[]) query("""
                SELECT count(*) FILTER (WHERE l.expiration_date <= :today),
                       coalesce(sum(b.quantity * p.cost) FILTER (WHERE l.expiration_date <= :today), 0),
                       count(*) FILTER (WHERE l.expiration_date > :today AND l.expiration_date <= :limit),
                       coalesce(sum(b.quantity * p.cost) FILTER (WHERE l.expiration_date > :today
                                AND l.expiration_date <= :limit), 0)
                FROM lot_balances b JOIN lots l ON l.id = b.lot_id JOIN products p ON p.id = b.product_id
                WHERE b.quantity > 0""" + branch, params).getSingleResult();
        Map<String, Object> unlottedParams = new HashMap<>(params);
        unlottedParams.remove("today");
        unlottedParams.remove("limit");
        long unlotted = ((Number) query("SELECT count(DISTINCT x.product_id) FROM (" + UNLOTTED_SQL
                + (branchId == null ? "" : " AND s.branch_id = :branch") + ") x", unlottedParams).getSingleResult())
                .longValue();
        return new LotSummary(months, ((Number) r[0]).longValue(), money(r[1]), ((Number) r[2]).longValue(),
                money(r[3]), unlotted);
    }

    private static final String UNLOTTED_SQL = """
            SELECT s.branch_id, br.name, p.id AS product_id, p.sku, p.name, u.code,
                   s.quantity - coalesce((SELECT sum(b.quantity) FROM lot_balances b
                                          WHERE b.branch_id = s.branch_id AND b.product_id = s.product_id), 0) AS unlotted
            FROM stock_balances s
            JOIN products p ON p.id = s.product_id
            JOIN units u ON u.id = p.base_unit_id
            JOIN branches br ON br.id = s.branch_id
            WHERE s.lot_id IS NULL AND p.tracks_lots AND s.quantity - coalesce((SELECT sum(b.quantity) FROM lot_balances b
                    WHERE b.branch_id = s.branch_id AND b.product_id = s.product_id), 0) > 0""";

    /** Productos que controlan lotes y tienen existencia sin lote (de antes): se les carga el lote con un conteo. */
    @Transactional(readOnly = true)
    public List<UnlottedRow> unlotted(UUID branchId) {
        Map<String, Object> params = new HashMap<>();
        String where = "";
        if (branchId != null) {
            where = " AND s.branch_id = :branch";
            params.put("branch", branchId);
        }
        List<UnlottedRow> rows = new ArrayList<>();
        for (Object o : query(UNLOTTED_SQL + where + " ORDER BY p.name LIMIT 500", params).getResultList()) {
            Object[] r = (Object[]) o;
            rows.add(new UnlottedRow((UUID) r[0], (String) r[1], (UUID) r[2], (String) r[3], (String) r[4],
                    (String) r[5], (BigDecimal) r[6]));
        }
        return rows;
    }

    @Transactional(readOnly = true)
    public ProductLots productLots(UUID productId, UUID branchId) {
        LocalDate today = today();
        LocalDate limit = today.plusMonths(alertMonths());
        Map<String, Object> params = Map.of("product", productId, "branch", branchId);
        List<LotRow> lots = new ArrayList<>();
        for (Object o : query(LOT_SQL + " AND b.product_id = :product AND b.branch_id = :branch"
                + " ORDER BY l.expiration_date NULLS LAST, l.lot_number", params).getResultList()) {
            lots.add(row((Object[]) o, today, limit));
        }
        Object balance = query("""
                SELECT coalesce((SELECT quantity FROM stock_balances WHERE product_id = :product AND branch_id = :branch
                                 AND lot_id IS NULL), 0)
                     - coalesce((SELECT sum(quantity) FROM lot_balances WHERE product_id = :product
                                 AND branch_id = :branch), 0)""", params).getSingleResult();
        BigDecimal unlotted = ((BigDecimal) balance).max(BigDecimal.ZERO);
        return new ProductLots(productId, branchId, unlotted, lots);
    }

    /**
     * Trazabilidad de un lote en todas las sucursales: de qué compra entró (proveedor y factura) y cada salida (venta
     * con su cliente, traslado, baja, devolución), en orden.
     */
    @Transactional(readOnly = true)
    public LotTrace trace(UUID productId, String lotNumber) {
        if (lotNumber == null || lotNumber.isBlank()) {
            throw new BusinessRuleException("Escribe el número del lote.");
        }
        String lot = LotRegistry.normalize(lotNumber);
        List<?> found = query("""
                SELECT l.id, p.sku, p.name, u.code, l.expiration_date
                FROM lots l JOIN products p ON p.id = l.product_id JOIN units u ON u.id = p.base_unit_id
                WHERE l.product_id = :product AND l.lot_number = :lot""", Map.of("product", productId, "lot", lot))
                .getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("El lote " + lot + " no está registrado para ese producto.");
        }
        Object[] l = (Object[]) found.getFirst();
        UUID lotId = (UUID) l[0];
        List<TraceEntry> entries = new ArrayList<>();
        BigDecimal received = BigDecimal.ZERO;
        BigDecimal sold = BigDecimal.ZERO;
        for (Object o : query("""
                SELECT m.created_at, br.name, m.type, m.quantity, m.reference_type, m.reason,
                       s.prefix || '-' || s.number, s.customer_name, s.customer_document_number,
                       d.number, pr.number, pr.supplier_invoice,
                       coalesce(sp.business_name, trim(coalesce(sp.first_names, '') || ' ' || coalesce(sp.last_names, '')))
                FROM stock_movements m
                JOIN branches br ON br.id = m.branch_id
                LEFT JOIN sales s ON m.reference_type = 'SALE' AND s.id = m.reference_id
                LEFT JOIN inventory_documents d ON m.reference_type = 'INVENTORY_DOCUMENT' AND d.id = m.reference_id
                LEFT JOIN purchase_receipts pr ON m.reference_type = 'PURCHASE_RECEIPT' AND pr.id = m.reference_id
                LEFT JOIN parties sp ON sp.id = pr.supplier_id
                WHERE m.lot_id = :lot ORDER BY m.entry_no""", Map.of("lot", lotId)).getResultList()) {
            Object[] r = (Object[]) o;
            String type = (String) r[2];
            BigDecimal quantity = (BigDecimal) r[3];
            String document;
            String party = null;
            if (r[6] != null) {
                document = "Venta " + r[6];
                party = r[7] + " (" + r[8] + ")";
            } else if (r[10] != null) {
                document = "Compra #" + r[10] + " · factura " + r[11];
                party = (String) r[12];
            } else if (r[9] != null) {
                document = "Documento de inventario #" + r[9];
            } else {
                document = (String) r[4];
            }
            if ("PURCHASE".equals(type)) {
                received = received.add(quantity);
            } else if ("SALE".equals(type)) {
                sold = sold.subtract(quantity);
            } else if ("SALE_VOID".equals(type)) {
                sold = sold.subtract(quantity);
            }
            entries.add(new TraceEntry(instant(r[0]), (String) r[1], type, quantity, document, party, (String) r[5]));
        }
        Object onHand = query("SELECT coalesce(sum(quantity), 0) FROM lot_balances WHERE lot_id = :lot",
                Map.of("lot", lotId)).getSingleResult();
        return new LotTrace(productId, (String) l[1], (String) l[2], (String) l[3], lot, StockLedger.toDate(l[4]),
                (BigDecimal) onHand, received, sold, entries);
    }

    // ------------------------------------------------------------------ apoyo

    private LotRow row(Object[] r, LocalDate today, LocalDate limit) {
        LocalDate expiration = StockLedger.toDate(r[8]);
        Long days = expiration == null ? null : ChronoUnit.DAYS.between(today, expiration);
        LotStatus status = expiration == null || expiration.isAfter(limit) ? LotStatus.OK
                : expiration.isAfter(today) ? LotStatus.EXPIRING : LotStatus.EXPIRED;
        return new LotRow((UUID) r[0], (String) r[1], (UUID) r[2], (String) r[3], (String) r[4], (String) r[5],
                (UUID) r[6], (String) r[7], expiration, (BigDecimal) r[9], money(r[10]), days, status);
    }

    private int alertMonths() {
        return settings.current().expiryAlertMonths();
    }

    private LocalDate today() {
        return LocalDate.now(ZoneId.of(settings.current().timezone()));
    }

    private Query query(String sql, Map<String, ?> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        return q;
    }

    private static BigDecimal money(Object value) {
        return value == null ? BigDecimal.ZERO.setScale(2) : ((BigDecimal) value).setScale(2, RoundingMode.HALF_UP);
    }

    private static Instant instant(Object value) {
        return value instanceof Timestamp t ? t.toInstant() : (Instant) value;
    }
}
