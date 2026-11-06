package com.poshibrido.purchasing.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Vistas de compras (Fase 13-2, decisión 280). */
public final class PurchaseViews {

    private PurchaseViews() {
    }

    /** Una compra en listas: lo pagado, el saldo y si está vencida. */
    public record ReceiptSummary(UUID id, long number, UUID branchId, String branchName, UUID supplierId,
                                 String supplierName, String supplierInvoice, LocalDate invoiceDate, String paymentType,
                                 LocalDate dueDate, BigDecimal total, BigDecimal paid, BigDecimal balance,
                                 boolean overdue, BigDecimal rejectedTotal, Instant receivedAt, String receivedByName,
                                 int lineCount, BigDecimal returnedTotal) {
    }

    public record LineView(int lineNo, UUID productId, String productName, String sku, String unitCode,
                           BigDecimal quantity, BigDecimal unitCost, BigDecimal taxRate, BigDecimal lineTotal,
                           String lotNumber, LocalDate expirationDate, String sanitaryRegistration, String status,
                           String rejectReason, BigDecimal baseQuantity, BigDecimal returnedQuantity) {
    }

    public record PaymentView(UUID id, BigDecimal amount, String methodName, boolean fromCash, String reference,
                              Instant paidAt, String paidByName) {
    }

    public record ReceiptView(ReceiptSummary summary, BigDecimal subtotal, BigDecimal taxTotal,
                              BigDecimal coldChainTemperature, String notes, boolean checksConfirmed,
                              List<LineView> lines, List<PaymentView> payments, List<ReturnView> returns,
                              DocumentRef document) {
    }

    /** La factura del proveedor guardada como soporte de la compra (decisión 290). */
    public record DocumentRef(UUID id, String fileName, String kind) {
    }

    /** Devolución al proveedor (Fase 13-3): lo devuelto baja lo que se le debe. */
    public record ReturnView(UUID id, long number, String reason, BigDecimal subtotal, BigDecimal taxTotal,
                             BigDecimal total, Instant createdAt, String createdByName, List<ReturnLineView> lines) {
    }

    public record ReturnLineView(int receiptLineNo, UUID productId, String productName, String unitCode,
                                 BigDecimal quantity, String lotNumber, BigDecimal lineTotal) {
    }

    /** Cuentas por pagar: lo que se debe, lo vencido, lo que vence en 7 días y las facturas con saldo. */
    public record Payables(BigDecimal totalDue, BigDecimal overdue, BigDecimal dueSoon, List<ReceiptSummary> receipts) {
    }
}
