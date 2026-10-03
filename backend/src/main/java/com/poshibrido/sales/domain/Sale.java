package com.poshibrido.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Venta (tiquete POS). Solo cambia al anularse: COMPLETED → VOIDED (lo garantiza también un trigger).
 * Guarda el cliente identificado y los totales por impuesto para el documento electrónico futuro.
 */
@Getter
@Entity
@Table(name = "sales")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Sale {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String prefix;

    @Column(nullable = false, updatable = false)
    private long number;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private SaleStatus status;

    @Column(name = "branch_id", nullable = false, updatable = false)
    private UUID branchId;

    @Column(name = "cash_register_id", nullable = false, updatable = false)
    private UUID cashRegisterId;

    @Column(name = "cash_session_id", nullable = false, updatable = false)
    private UUID cashSessionId;

    @Column(name = "customer_id", nullable = false, updatable = false)
    private UUID customerId;

    @Column(name = "customer_document_type", nullable = false, updatable = false)
    private String customerDocumentType;

    @Column(name = "customer_document_number", nullable = false, updatable = false)
    private String customerDocumentNumber;

    @Column(name = "customer_verification_digit", updatable = false)
    private Integer customerVerificationDigit;

    @Column(name = "customer_name", nullable = false, updatable = false)
    private String customerName;

    @Column(name = "price_list_id", updatable = false)
    private UUID priceListId;

    @Column(name = "prices_include_tax", nullable = false, updatable = false)
    private boolean pricesIncludeTax;

    @Column(name = "gross_total", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal grossTotal;

    @Column(name = "discount_total", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal discountTotal;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal subtotal;

    @Column(name = "tax_total", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal taxTotal;

    @Column(nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(name = "paid_total", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal paidTotal;

    @Column(name = "change_amount", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal changeAmount;

    @Column(name = "item_count", nullable = false, updatable = false)
    private int itemCount;

    @Column(updatable = false)
    private String notes;

    @Column(name = "idempotency_key", nullable = false, updatable = false)
    private String idempotencyKey;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "voided_at")
    private Instant voidedAt;

    @Column(name = "voided_by")
    private UUID voidedBy;

    @Column(name = "void_reason")
    private String voidReason;

    @Column(name = "void_cash_session_id")
    private UUID voidCashSessionId;

    @Version
    private Long version;

    /** Datos de la venta ya calculados por el servidor. */
    public record Data(UUID id, String prefix, long number, UUID branchId, UUID cashRegisterId, UUID cashSessionId,
                       UUID customerId, String customerDocumentType, String customerDocumentNumber,
                       Integer customerVerificationDigit, String customerName, UUID priceListId,
                       boolean pricesIncludeTax, BigDecimal grossTotal, BigDecimal discountTotal, BigDecimal subtotal,
                       BigDecimal taxTotal, BigDecimal total, BigDecimal paidTotal, BigDecimal changeAmount,
                       int itemCount, String notes, String idempotencyKey, UUID createdBy) {
    }

    public static Sale complete(Data d) {
        Sale s = new Sale();
        s.id = d.id();
        s.prefix = d.prefix();
        s.number = d.number();
        s.status = SaleStatus.COMPLETED;
        s.branchId = d.branchId();
        s.cashRegisterId = d.cashRegisterId();
        s.cashSessionId = d.cashSessionId();
        s.customerId = d.customerId();
        s.customerDocumentType = d.customerDocumentType();
        s.customerDocumentNumber = d.customerDocumentNumber();
        s.customerVerificationDigit = d.customerVerificationDigit();
        s.customerName = d.customerName();
        s.priceListId = d.priceListId();
        s.pricesIncludeTax = d.pricesIncludeTax();
        s.grossTotal = d.grossTotal();
        s.discountTotal = d.discountTotal();
        s.subtotal = d.subtotal();
        s.taxTotal = d.taxTotal();
        s.total = d.total();
        s.paidTotal = d.paidTotal();
        s.changeAmount = d.changeAmount();
        s.itemCount = d.itemCount();
        s.notes = d.notes();
        s.idempotencyKey = d.idempotencyKey();
        s.createdBy = d.createdBy();
        s.createdAt = Instant.now();
        return s;
    }

    /** Número visible del tiquete, p. ej. {@code POS-12}. */
    public String documentNumber() {
        return prefix + "-" + number;
    }

    public boolean isVoided() {
        return status == SaleStatus.VOIDED;
    }

    /**
     * @param cashSessionId sesión donde se devolvió el efectivo; nula si la venta no tuvo pagos en efectivo
     */
    public void voidSale(UUID voidedBy, String reason, UUID cashSessionId) {
        if (isVoided()) {
            throw new IllegalStateException("La venta ya está anulada");
        }
        this.status = SaleStatus.VOIDED;
        this.voidedAt = Instant.now();
        this.voidedBy = voidedBy;
        this.voidReason = reason;
        this.voidCashSessionId = cashSessionId;
    }
}
