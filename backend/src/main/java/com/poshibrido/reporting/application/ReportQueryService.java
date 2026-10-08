package com.poshibrido.reporting.application;

import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.reporting.application.ReportViews.CategoryRow;
import com.poshibrido.reporting.application.ReportViews.Dashboard;
import com.poshibrido.reporting.application.ReportViews.DayRow;
import com.poshibrido.reporting.application.ReportViews.HourRow;
import com.poshibrido.reporting.application.ReportViews.InventoryRow;
import com.poshibrido.reporting.application.ReportViews.InventoryValuation;
import com.poshibrido.reporting.application.ReportViews.MyDay;
import com.poshibrido.reporting.application.ReportViews.PaymentRow;
import com.poshibrido.reporting.application.ReportViews.ProductRow;
import com.poshibrido.reporting.application.ReportViews.SaleLine;
import com.poshibrido.reporting.application.ReportViews.SalesRow;
import com.poshibrido.reporting.application.ReportViews.Summary;
import com.poshibrido.reporting.application.ReportViews.TaxRow;
import com.poshibrido.shared.error.BusinessRuleException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Reportes de solo lectura con SQL nativo sobre las tablas del negocio (modelo de lectura: agrega datos de ventas,
 * catálogo, inventario y caja sin pasar por sus servicios). Usa la conexión del negocio actual (search_path).
 */
@Service
@Transactional(readOnly = true)
public class ReportQueryService {

    private static final UUID NONE = new UUID(0, 0);
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    /** Límite de filas del CSV de ventas. */
    static final int MAX_SALE_LINES = 100_000;

    /** Ventas registradas (no anuladas) del rango y filtros. */
    private static final String FILTERED = """
            filtered AS (
                SELECT s.* FROM sales s
                WHERE s.status = 'COMPLETED' AND s.created_at >= :start AND s.created_at < :end
                  AND (:anyBranch OR s.branch_id = :branchId)
                  AND (:anySeller OR s.created_by = :sellerId)
            )""";

    /** Costo de lo vendido por venta (costo promedio guardado en cada línea × cantidad en unidad base). */
    private static final String COSTS = """
            costs AS (
                SELECT si.sale_id, sum(si.unit_cost * si.base_quantity) AS cost
                FROM sale_items si JOIN filtered f ON f.id = si.sale_id
                GROUP BY si.sale_id
            )""";

    @PersistenceContext
    private EntityManager em;

    private final BusinessSettingsApi settings;

    public ReportQueryService(BusinessSettingsApi settings) {
        this.settings = settings;
    }

    public ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    public LocalDate today() {
        return LocalDate.now(zone());
    }

    public ReportPeriod period(LocalDate from, LocalDate to) {
        return ReportPeriod.of(from, to, zone(), today());
    }

    // ---------------------------------------------------------------- ventas

    public Summary summary(ReportFilter filter) {
        Object[] row = (Object[]) sales("WITH " + FILTERED + ", " + COSTS + """
                SELECT count(*) AS sales_count, coalesce(sum(f.gross_total), 0) AS gross,
                       coalesce(sum(f.discount_total), 0) AS discount, coalesce(sum(f.subtotal), 0) AS subtotal,
                       coalesce(sum(f.tax_total), 0) AS tax, coalesce(sum(f.total), 0) AS total,
                       coalesce(round(sum(c.cost), 2), 0) AS cost
                FROM filtered f LEFT JOIN costs c ON c.sale_id = f.id
                """, filter).getSingleResult();
        Object[] voided = (Object[]) sales("""
                SELECT count(*) AS voided_count, coalesce(sum(s.total), 0) AS voided_total FROM sales s
                WHERE s.status = 'VOIDED' AND s.created_at >= :start AND s.created_at < :end
                  AND (:anyBranch OR s.branch_id = :branchId)
                  AND (:anySeller OR s.created_by = :sellerId)
                """, filter).getSingleResult();
        long count = Rows.lng(row[0]);
        BigDecimal subtotal = Rows.decimal(row[3]);
        BigDecimal total = Rows.decimal(row[5]);
        BigDecimal cost = Rows.decimal(row[6]);
        BigDecimal profit = subtotal.subtract(cost);
        return new Summary(filter.period().from(), filter.period().to(), count, Rows.decimal(row[1]),
                Rows.decimal(row[2]), subtotal, Rows.decimal(row[4]), total, average(total, count), cost, profit,
                margin(profit, subtotal), Rows.lng(voided[0]), Rows.decimal(voided[1]));
    }

    /** Ventas por día (fecha local del negocio). */
    public List<SalesRow> byDay(ReportFilter filter) {
        String day = "to_char(f.created_at AT TIME ZONE :tz, 'YYYY-MM-DD')";
        return grouped(filter, day, day, "", "1", true);
    }

    public List<SalesRow> byBranch(ReportFilter filter) {
        return grouped(filter, "CAST(b.id AS text)", "b.name", "JOIN branches b ON b.id = f.branch_id",
                "6 DESC, 2", false);
    }

    public List<SalesRow> bySeller(ReportFilter filter) {
        return grouped(filter, "CAST(f.created_by AS text)", "coalesce(m.display_name, 'Sin nombre')",
                "LEFT JOIN members m ON m.id = f.created_by", "6 DESC, 2", false);
    }

    public List<PaymentRow> byPaymentMethod(ReportFilter filter) {
        List<PaymentRow> result = new ArrayList<>();
        for (Object row : sales("WITH " + FILTERED + """
                SELECT pm.id AS method_id, pm.code AS code, pm.name AS name, count(*) AS payments,
                       coalesce(sum(sp.amount), 0) AS amount
                FROM sale_payments sp JOIN filtered f ON f.id = sp.sale_id
                JOIN payment_methods pm ON pm.id = sp.payment_method_id
                GROUP BY pm.id, pm.code, pm.name, pm.sort_order
                ORDER BY pm.sort_order, pm.name
                """, filter).getResultList()) {
            Object[] r = (Object[]) row;
            result.add(new PaymentRow(Rows.uuid(r[0]), Rows.str(r[1]), Rows.str(r[2]), Rows.lng(r[3]),
                    Rows.decimal(r[4])));
        }
        return result;
    }

    /**
     * Productos más vendidos.
     *
     * @param byQuantity ordena por cantidad (unidad base) en vez de por valor vendido
     */
    public List<ProductRow> topProducts(ReportFilter filter, int limit, boolean byQuantity) {
        return products(filter, Math.min(Math.max(limit, 1), 1000), byQuantity);
    }

    /**
     * Todos los productos vendidos en el periodo, para el CSV (QA DIN-5: antes se cortaba en 1.000 sin avisar y los
     * totales no cuadraban con el resumen). El tope es solo de seguridad: ningún catálogo vende tantos en un periodo.
     */
    public List<ProductRow> allProducts(ReportFilter filter, boolean byQuantity) {
        return products(filter, EXPORT_PRODUCTS_LIMIT, byQuantity);
    }

    static final int EXPORT_PRODUCTS_LIMIT = 50_000;

    private List<ProductRow> products(ReportFilter filter, int limit, boolean byQuantity) {
        Query query = sales("WITH " + FILTERED + """
                SELECT si.product_id AS product_id, p.sku AS sku, p.name AS product_name, c.name AS category_name,
                       u.code AS unit_code, sum(si.base_quantity) AS quantity, sum(si.taxable_base) AS subtotal,
                       sum(si.total) AS total, round(sum(si.unit_cost * si.base_quantity), 2) AS cost
                FROM sale_items si JOIN filtered f ON f.id = si.sale_id
                JOIN products p ON p.id = si.product_id
                LEFT JOIN categories c ON c.id = p.category_id
                JOIN units u ON u.id = p.base_unit_id
                GROUP BY si.product_id, p.sku, p.name, c.name, u.code
                ORDER BY %s DESC, product_name
                LIMIT :limit
                """.formatted(byQuantity ? "6" : "8"), filter);
        query.setParameter("limit", limit);
        List<ProductRow> result = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            BigDecimal subtotal = Rows.decimal(r[6]);
            BigDecimal cost = Rows.decimal(r[8]);
            BigDecimal profit = subtotal.subtract(cost);
            result.add(new ProductRow(Rows.uuid(r[0]), Rows.str(r[1]), Rows.str(r[2]), Rows.str(r[3]),
                    Rows.str(r[4]), Rows.decimal(r[5]), subtotal, Rows.decimal(r[7]), cost, profit,
                    margin(profit, subtotal)));
        }
        return result;
    }

    public List<CategoryRow> byCategory(ReportFilter filter) {
        List<CategoryRow> result = new ArrayList<>();
        for (Object row : sales("WITH " + FILTERED + """
                SELECT p.category_id AS category_id, coalesce(c.name, 'Sin categoría') AS category_name,
                       sum(si.taxable_base) AS subtotal, sum(si.total) AS total,
                       round(sum(si.unit_cost * si.base_quantity), 2) AS cost
                FROM sale_items si JOIN filtered f ON f.id = si.sale_id
                JOIN products p ON p.id = si.product_id
                LEFT JOIN categories c ON c.id = p.category_id
                GROUP BY p.category_id, c.name
                ORDER BY 4 DESC, 2
                """, filter).getResultList()) {
            Object[] r = (Object[]) row;
            BigDecimal subtotal = Rows.decimal(r[2]);
            BigDecimal cost = Rows.decimal(r[4]);
            BigDecimal profit = subtotal.subtract(cost);
            result.add(new CategoryRow(Rows.uuid(r[0]), Rows.str(r[1]), subtotal, Rows.decimal(r[3]), cost, profit,
                    margin(profit, subtotal)));
        }
        return result;
    }

    /** Base e impuesto por tipo y tarifa (para la declaración de IVA/INC). */
    public List<TaxRow> taxes(ReportFilter filter) {
        List<TaxRow> result = new ArrayList<>();
        for (Object row : sales("WITH " + FILTERED + """
                SELECT t.tax_type AS tax_type, t.tax_rate AS tax_rate, count(DISTINCT t.sale_id) AS sales_count,
                       sum(t.taxable_base) AS taxable_base, sum(t.tax_amount) AS tax_amount
                FROM sale_tax_totals t JOIN filtered f ON f.id = t.sale_id
                GROUP BY t.tax_type, t.tax_rate
                ORDER BY t.tax_rate DESC, t.tax_type
                """, filter).getResultList()) {
            Object[] r = (Object[]) row;
            result.add(new TaxRow(Rows.str(r[0]), Rows.decimal(r[1]), Rows.lng(r[2]), Rows.decimal(r[3]),
                    Rows.decimal(r[4])));
        }
        return result;
    }

    /** Ventas una por una (incluidas las anuladas, con su estado) para exportar. */
    public List<SaleLine> saleLines(ReportFilter filter) {
        Query query = sales("""
                SELECT s.prefix || '-' || s.number AS document_number, s.created_at AS created_at, s.status AS status,
                       b.name AS branch_name, cr.code AS register_code, m.display_name AS seller_name,
                       s.customer_document_type || ' ' || s.customer_document_number
                           || coalesce('-' || s.customer_verification_digit, '') AS customer_document,
                       s.customer_name AS customer_name, s.discount_total AS discount_total, s.subtotal AS subtotal,
                       s.tax_total AS tax_total, s.total AS total,
                       (SELECT string_agg(pm.name, ' + ' ORDER BY sp.line_no)
                          FROM sale_payments sp JOIN payment_methods pm ON pm.id = sp.payment_method_id
                         WHERE sp.sale_id = s.id) AS payment_methods
                FROM sales s
                JOIN branches b ON b.id = s.branch_id
                JOIN cash_registers cr ON cr.id = s.cash_register_id
                LEFT JOIN members m ON m.id = s.created_by
                WHERE s.created_at >= :start AND s.created_at < :end
                  AND (:anyBranch OR s.branch_id = :branchId)
                  AND (:anySeller OR s.created_by = :sellerId)
                ORDER BY s.created_at, s.number
                LIMIT :limit
                """, filter);
        query.setParameter("limit", MAX_SALE_LINES + 1);
        List<?> rows = query.getResultList();
        if (rows.size() > MAX_SALE_LINES) {
            throw new BusinessRuleException("Hay más de " + MAX_SALE_LINES + " ventas en el periodo. "
                    + "Exporta un rango más corto.");
        }
        List<SaleLine> result = new ArrayList<>();
        for (Object row : rows) {
            Object[] r = (Object[]) row;
            result.add(new SaleLine(Rows.str(r[0]), Rows.instant(r[1]), "VOIDED".equals(Rows.str(r[2]))
                    ? "Anulada" : "Registrada", Rows.str(r[3]), Rows.str(r[4]), Rows.str(r[5]), Rows.str(r[6]),
                    Rows.str(r[7]), Rows.decimal(r[8]), Rows.decimal(r[9]), Rows.decimal(r[10]),
                    Rows.decimal(r[11]), Rows.str(r[12])));
        }
        return result;
    }

    // ---------------------------------------------------------------- inventario

    /** Existencias actuales × costo promedio, por sucursal y producto. */
    public InventoryValuation inventoryValuation(UUID branchId) {
        Query query = em.createNativeQuery("""
                SELECT b.id AS branch_id, b.name AS branch_name, p.id AS product_id, p.sku AS sku,
                       p.name AS product_name, c.name AS category_name, u.code AS unit_code, sb.quantity AS quantity,
                       p.cost AS average_cost, round(sb.quantity * p.cost, 2) AS stock_value
                FROM stock_balances sb
                JOIN products p ON p.id = sb.product_id
                JOIN branches b ON b.id = sb.branch_id
                LEFT JOIN categories c ON c.id = p.category_id
                JOIN units u ON u.id = p.base_unit_id
                WHERE sb.lot_id IS NULL AND p.track_inventory AND sb.quantity <> 0
                  AND (:anyBranch OR sb.branch_id = :branchId)
                ORDER BY b.code, p.name
                """);
        query.setParameter("anyBranch", branchId == null);
        query.setParameter("branchId", branchId == null ? NONE : branchId);
        List<InventoryRow> rows = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            BigDecimal value = Rows.decimal(r[9]);
            total = total.add(value);
            rows.add(new InventoryRow(Rows.uuid(r[0]), Rows.str(r[1]), Rows.uuid(r[2]), Rows.str(r[3]),
                    Rows.str(r[4]), Rows.str(r[5]), Rows.str(r[6]), Rows.decimal(r[7]), Rows.decimal(r[8]), value));
        }
        long products = rows.stream().map(InventoryRow::productId).distinct().count();
        return new InventoryValuation(rows, total, products);
    }

    // ---------------------------------------------------------------- tablero

    public Dashboard dashboard(UUID branchId) {
        LocalDate today = today();
        ZoneId zone = zone();
        ReportFilter day = new ReportFilter(ReportPeriod.of(today, today, zone, today), branchId, null);
        ReportFilter yesterday = new ReportFilter(ReportPeriod.of(today.minusDays(1), today.minusDays(1), zone, today),
                branchId, null);
        ReportFilter week = new ReportFilter(ReportPeriod.of(today.minusDays(6), today, zone, today), branchId, null);
        return new Dashboard(today, summary(day), summary(yesterday).total(), byHour(day), last7Days(week),
                topProducts(day, 5, false), byPaymentMethod(day));
    }

    /** Ventas del día del usuario actual. */
    public MyDay myDay(UUID userId) {
        LocalDate today = today();
        ReportFilter filter = new ReportFilter(ReportPeriod.of(today, today, zone(), today), null, userId);
        Summary summary = summary(filter);
        return new MyDay(today, summary.salesCount(), summary.total(), summary.averageTicket(),
                byPaymentMethod(filter));
    }

    private List<HourRow> byHour(ReportFilter filter) {
        Map<Integer, HourRow> found = new HashMap<>();
        Query query = sales("WITH " + FILTERED + """
                SELECT CAST(extract(hour FROM f.created_at AT TIME ZONE :tz) AS integer) AS hour_of_day,
                       count(*) AS sales_count, sum(f.total) AS total
                FROM filtered f GROUP BY 1 ORDER BY 1
                """, filter);
        query.setParameter("tz", filter.period().zone().getId());
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            int hour = ((Number) r[0]).intValue();
            found.put(hour, new HourRow(hour, Rows.lng(r[1]), Rows.decimal(r[2])));
        }
        List<HourRow> hours = new ArrayList<>(24);
        for (int h = 0; h < 24; h++) {
            hours.add(found.getOrDefault(h, new HourRow(h, 0, BigDecimal.ZERO)));
        }
        return hours;
    }

    private List<DayRow> last7Days(ReportFilter filter) {
        Map<String, SalesRow> found = new HashMap<>();
        byDay(filter).forEach(r -> found.put(r.key(), r));
        List<DayRow> days = new ArrayList<>();
        for (LocalDate d = filter.period().from(); !d.isAfter(filter.period().to()); d = d.plusDays(1)) {
            SalesRow r = found.get(d.toString());
            days.add(new DayRow(d, r == null ? 0 : r.salesCount(), r == null ? BigDecimal.ZERO : r.total()));
        }
        return days;
    }

    // ---------------------------------------------------------------- apoyo

    private List<SalesRow> grouped(ReportFilter filter, String keyExpr, String labelExpr, String joins,
                                   String orderBy, boolean usesZone) {
        Query query = sales("WITH " + FILTERED + ", " + COSTS + """
                SELECT %s AS row_key, %s AS row_label, count(*) AS sales_count, sum(f.subtotal) AS subtotal,
                       sum(f.tax_total) AS tax, sum(f.total) AS total, coalesce(round(sum(c.cost), 2), 0) AS cost
                FROM filtered f LEFT JOIN costs c ON c.sale_id = f.id
                %s
                GROUP BY 1, 2
                ORDER BY %s
                """.formatted(keyExpr, labelExpr, joins, orderBy), filter);
        if (usesZone) {
            query.setParameter("tz", filter.period().zone().getId());
        }
        List<SalesRow> result = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            long count = Rows.lng(r[2]);
            BigDecimal subtotal = Rows.decimal(r[3]);
            BigDecimal total = Rows.decimal(r[5]);
            BigDecimal cost = Rows.decimal(r[6]);
            BigDecimal profit = subtotal.subtract(cost);
            result.add(new SalesRow(Rows.str(r[0]), Rows.str(r[1]), count, subtotal, Rows.decimal(r[4]), total,
                    average(total, count), cost, profit, margin(profit, subtotal)));
        }
        return result;
    }

    /** Consulta nativa con los parámetros comunes de rango, sucursal y vendedor. */
    private Query sales(String sql, ReportFilter filter) {
        Query query = em.createNativeQuery(sql);
        query.setParameter("start", filter.period().start());
        query.setParameter("end", filter.period().end());
        query.setParameter("anyBranch", filter.branchId() == null);
        query.setParameter("branchId", filter.branchId() == null ? NONE : filter.branchId());
        query.setParameter("anySeller", filter.sellerId() == null);
        query.setParameter("sellerId", filter.sellerId() == null ? NONE : filter.sellerId());
        return query;
    }

    static BigDecimal average(BigDecimal total, long count) {
        return count == 0 ? BigDecimal.ZERO.setScale(2) : total.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
    }

    static BigDecimal margin(BigDecimal profit, BigDecimal subtotal) {
        return subtotal.signum() == 0
                ? BigDecimal.ZERO.setScale(2)
                : profit.multiply(HUNDRED).divide(subtotal, 2, RoundingMode.HALF_UP);
    }
}
