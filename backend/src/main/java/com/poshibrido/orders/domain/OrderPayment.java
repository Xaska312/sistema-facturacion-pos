package com.poshibrido.orders.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

/** Movimiento del anticipo de un pedido. Inmutable: la base de datos rechaza UPDATE y DELETE. */
@Getter
@Entity
@Immutable
@Table(name = "order_payments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderPayment {

    @Id
    private UUID id;

    @Column(name = "entry_no", insertable = false, updatable = false)
    private Long entryNo;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderPaymentType type;

    /** Con signo: positivo aumenta lo anticipado disponible. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(name = "payment_method_id")
    private UUID paymentMethodId;

    @Column(name = "method_code")
    private String methodCode;

    @Column
    private String reference;

    @Column
    private String notes;

    @Column(name = "cash_session_id")
    private UUID cashSessionId;

    @Column(name = "sale_id")
    private UUID saleId;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public record Data(UUID orderId, OrderPaymentType type, BigDecimal amount, UUID paymentMethodId, String methodCode,
                       String reference, String notes, UUID cashSessionId, UUID saleId, String idempotencyKey,
                       UUID createdBy) {
    }

    /** @param d {@code amount} positivo; el signo lo pone el tipo */
    public static OrderPayment record(Data d) {
        if (d.amount() == null || d.amount().signum() <= 0) {
            throw new IllegalArgumentException("El valor del movimiento debe ser positivo");
        }
        OrderPayment p = new OrderPayment();
        p.id = Ids.newId();
        p.orderId = d.orderId();
        p.type = d.type();
        BigDecimal value = d.amount().setScale(2, RoundingMode.HALF_UP);
        p.amount = d.type().isPositive() ? value : value.negate();
        p.paymentMethodId = d.paymentMethodId();
        p.methodCode = d.methodCode();
        p.reference = d.reference();
        p.notes = d.notes();
        p.cashSessionId = d.cashSessionId();
        p.saleId = d.saleId();
        p.idempotencyKey = d.idempotencyKey();
        p.createdBy = d.createdBy();
        p.createdAt = Instant.now();
        return p;
    }
}
