package com.poshibrido.credit.domain;

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

/** Movimiento de la cuenta de fiado. Inmutable: la base de datos rechaza UPDATE y DELETE (decisión 255). */
@Getter
@Entity
@Immutable
@Table(name = "credit_entries")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditEntry {

    @Id
    private UUID id;

    @Column(name = "entry_no", insertable = false, updatable = false)
    private Long entryNo;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CreditEntryType type;

    /** Con signo: positivo aumenta la deuda, negativo la reduce. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(name = "sale_id")
    private UUID saleId;

    /** Abono que anula un PAYMENT_VOID. */
    @Column(name = "payment_id")
    private UUID paymentId;

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

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public record Data(UUID customerId, CreditEntryType type, BigDecimal amount, UUID saleId, UUID paymentId,
                       UUID paymentMethodId, String methodCode, String reference, String notes, UUID cashSessionId,
                       String idempotencyKey, UUID createdBy) {
    }

    /**
     * @param d {@code amount} positivo; el signo lo pone el tipo
     */
    public static CreditEntry record(Data d) {
        if (d.amount() == null || d.amount().signum() <= 0) {
            throw new IllegalArgumentException("El valor del movimiento debe ser positivo");
        }
        CreditEntry e = new CreditEntry();
        e.id = Ids.newId();
        e.customerId = d.customerId();
        e.type = d.type();
        BigDecimal value = d.amount().setScale(2, RoundingMode.HALF_UP);
        e.amount = d.type().increasesDebt() ? value : value.negate();
        e.saleId = d.saleId();
        e.paymentId = d.paymentId();
        e.paymentMethodId = d.paymentMethodId();
        e.methodCode = d.methodCode();
        e.reference = d.reference();
        e.notes = d.notes();
        e.cashSessionId = d.cashSessionId();
        e.idempotencyKey = d.idempotencyKey();
        e.createdBy = d.createdBy();
        e.createdAt = Instant.now();
        return e;
    }
}
