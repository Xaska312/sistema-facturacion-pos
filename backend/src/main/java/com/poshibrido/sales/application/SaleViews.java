package com.poshibrido.sales.application;

import com.poshibrido.sales.domain.SaleStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Vistas de ventas para la API. */
public final class SaleViews {

    private SaleViews() {
    }

    public record SaleRow(UUID id, String documentNumber, long number, SaleStatus status, Instant createdAt,
                          UUID branchId, String branchName, UUID cashRegisterId, String registerCode,
                          String customerName, String customerDocument, BigDecimal total, int itemCount,
                          UUID createdBy, String createdByName) {
    }

    public record ItemView(int lineNo, UUID productId, String sku, String name, UUID unitId, String unitCode,
                           BigDecimal quantity, BigDecimal unitPrice, BigDecimal grossAmount,
                           BigDecimal discountPercent, BigDecimal discountAmount, String taxType, BigDecimal taxRate,
                           BigDecimal taxableBase, BigDecimal taxAmount, BigDecimal total) {
    }

    public record PaymentView(int lineNo, UUID paymentMethodId, String methodCode, String methodName,
                              BigDecimal amount, BigDecimal tendered, String reference) {
    }

    public record TaxView(UUID taxId, String taxType, BigDecimal taxRate, BigDecimal taxableBase,
                          BigDecimal taxAmount) {
    }

    /** Encabezado del tiquete. */
    public record ReceiptHeader(String businessName, String branchName, String branchAddress, String branchPhone,
                                String registerCode, String registerName, String footer, String timezone) {
    }

    public record SaleView(UUID id, String documentNumber, String prefix, long number, SaleStatus status,
                           Instant createdAt, UUID branchId, UUID cashRegisterId, UUID cashSessionId,
                           UUID customerId, String customerDocumentType, String customerDocumentNumber,
                           Integer customerVerificationDigit, String customerName, boolean pricesIncludeTax,
                           BigDecimal grossTotal, BigDecimal discountTotal, BigDecimal subtotal, BigDecimal taxTotal,
                           BigDecimal total, BigDecimal paidTotal, BigDecimal changeAmount, String notes,
                           UUID createdBy, String createdByName, Instant voidedAt, UUID voidedBy,
                           String voidedByName, String voidReason, List<ItemView> items, List<PaymentView> payments,
                           List<TaxView> taxes, ReceiptHeader receipt) {
    }

    /** Lo que la pantalla de venta necesita del negocio (sin requerir permisos de configuración). */
    public record PosConfig(boolean pricesIncludeTax, BigDecimal maxDiscountPercent, boolean allowNegativeStock,
                            String currency, String receiptFooter, String businessName, UUID finalConsumerId) {
    }
}
