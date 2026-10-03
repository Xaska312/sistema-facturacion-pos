package com.poshibrido.cash.domain;

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

/** Movimiento de efectivo de una sesión. Inmutable: la base de datos rechaza UPDATE y DELETE. */
@Getter
@Entity
@Immutable
@Table(name = "cash_movements")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CashMovement {

    @Id
    private UUID id;

    @Column(name = "entry_no", insertable = false, updatable = false)
    private Long entryNo;

    @Column(name = "cash_session_id", nullable = false)
    private UUID cashSessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CashMovementType type;

    /** Con signo: positivo entra a la caja, negativo sale. */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column
    private String reason;

    @Column(name = "reference_type")
    private String referenceType;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /**
     * @param amount valor positivo; el signo lo pone el tipo
     */
    public static CashMovement record(UUID sessionId, CashMovementType type, BigDecimal amount, String reason,
                                      String referenceType, UUID referenceId, String idempotencyKey, UUID createdBy) {
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException("El valor del movimiento debe ser positivo");
        }
        CashMovement m = new CashMovement();
        m.id = Ids.newId();
        m.cashSessionId = sessionId;
        m.type = type;
        BigDecimal value = amount.setScale(2, RoundingMode.HALF_UP);
        m.amount = type.isEntry() ? value : value.negate();
        m.reason = reason;
        m.referenceType = referenceType;
        m.referenceId = referenceId;
        m.idempotencyKey = idempotencyKey;
        m.createdBy = createdBy;
        m.createdAt = Instant.now();
        return m;
    }
}
