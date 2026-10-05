package com.poshibrido.reporting.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Vistas de los reportes. Solo cuentan las ventas registradas (no anuladas); las anuladas se informan aparte en el
 * resumen. {@code subtotal} es la base sin impuestos ni descuentos; utilidad = base − costo (costo promedio guardado
 * en cada venta).
 */
public final class ReportViews {

    private ReportViews() {
    }

    public record Summary(LocalDate from, LocalDate to, long salesCount, BigDecimal grossTotal,
                          BigDecimal discountTotal, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                          BigDecimal averageTicket, BigDecimal cost, BigDecimal profit, BigDecimal marginPercent,
                          long voidedCount, BigDecimal voidedTotal) {
    }

    /** Fila agrupada (por día, sucursal o vendedor) con su utilidad. */
    public record SalesRow(String key, String label, long salesCount, BigDecimal subtotal, BigDecimal taxTotal,
                           BigDecimal total, BigDecimal averageTicket, BigDecimal cost, BigDecimal profit,
                           BigDecimal marginPercent) {
    }

    public record PaymentRow(UUID paymentMethodId, String code, String name, long count, BigDecimal amount) {
    }

    public record ProductRow(UUID productId, String sku, String name, String categoryName, String unitCode,
                             BigDecimal quantity, BigDecimal subtotal, BigDecimal total, BigDecimal cost,
                             BigDecimal profit, BigDecimal marginPercent) {
    }

    public record CategoryRow(UUID categoryId, String categoryName, BigDecimal subtotal, BigDecimal total,
                              BigDecimal cost, BigDecimal profit, BigDecimal marginPercent) {
    }

    public record TaxRow(String taxType, BigDecimal taxRate, long salesCount, BigDecimal taxableBase,
                         BigDecimal taxAmount) {
    }

    public record InventoryRow(UUID branchId, String branchName, UUID productId, String sku, String name,
                               String categoryName, String unitCode, BigDecimal quantity, BigDecimal averageCost,
                               BigDecimal value) {
    }

    public record InventoryValuation(List<InventoryRow> rows, BigDecimal totalValue, long productCount) {
    }

    public record SaleLine(String documentNumber, Instant createdAt, String status, String branchName,
                           String registerCode, String sellerName, String customerDocument, String customerName,
                           BigDecimal discountTotal, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                           String paymentMethods) {
    }

    public record HourRow(int hour, long salesCount, BigDecimal total) {
    }

    public record DayRow(LocalDate date, long salesCount, BigDecimal total) {
    }

    /** Tablero del día (permiso reports:read). */
    public record Dashboard(LocalDate date, Summary today, BigDecimal yesterdayTotal, List<HourRow> byHour,
                            List<DayRow> last7Days, List<ProductRow> topProducts, List<PaymentRow> byPaymentMethod) {
    }

    /** Ventas propias del día (cajero o vendedor). */
    public record MyDay(LocalDate date, long salesCount, BigDecimal total, BigDecimal averageTicket,
                        List<PaymentRow> byPaymentMethod) {
    }
}
