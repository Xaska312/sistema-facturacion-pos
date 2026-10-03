package com.poshibrido.cash.domain;

import com.poshibrido.shared.id.Ids;
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
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

/**
 * Turno de caja: se abre con una base de efectivo y se cierra con el arqueo. Una sesión cerrada no se
 * modifica (lo garantiza también un trigger de la base de datos).
 */
@Getter
@Entity
@Table(name = "cash_sessions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CashSession {

    @Id
    private UUID id;

    @Column(name = "cash_register_id", nullable = false, updatable = false)
    private UUID cashRegisterId;

    @Column(name = "branch_id", nullable = false, updatable = false)
    private UUID branchId;

    @Column(name = "opened_by", nullable = false, updatable = false)
    private UUID openedBy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CashSessionStatus status;

    @Column(name = "opening_amount", nullable = false, updatable = false, precision = 14, scale = 2)
    private BigDecimal openingAmount;

    @Column(name = "opening_notes", updatable = false)
    private String openingNotes;

    @Column(name = "opened_at", nullable = false, updatable = false)
    private Instant openedAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "closed_by")
    private UUID closedBy;

    @Column(name = "counted_amount", precision = 14, scale = 2)
    private BigDecimal countedAmount;

    @Column(name = "expected_amount", precision = 14, scale = 2)
    private BigDecimal expectedAmount;

    @Column(precision = 14, scale = 2)
    private BigDecimal difference;

    @Column(name = "closing_notes")
    private String closingNotes;

    @Version
    private Long version;

    public static CashSession open(UUID cashRegisterId, UUID branchId, UUID openedBy, BigDecimal openingAmount,
                                   String notes) {
        CashSession s = new CashSession();
        s.id = Ids.newId();
        s.cashRegisterId = cashRegisterId;
        s.branchId = branchId;
        s.openedBy = openedBy;
        s.status = CashSessionStatus.OPEN;
        s.openingAmount = openingAmount.setScale(2, RoundingMode.HALF_UP);
        s.openingNotes = notes;
        s.openedAt = Instant.now();
        return s;
    }

    public boolean isOpen() {
        return status == CashSessionStatus.OPEN;
    }

    /** Cierra con el conteo del usuario; el esperado lo calcula quien llama (apertura + movimientos). */
    public void close(BigDecimal counted, BigDecimal expected, UUID closedBy, String notes) {
        if (!isOpen()) {
            throw new IllegalStateException("La sesión ya está cerrada");
        }
        this.status = CashSessionStatus.CLOSED;
        this.countedAmount = counted.setScale(2, RoundingMode.HALF_UP);
        this.expectedAmount = expected.setScale(2, RoundingMode.HALF_UP);
        this.difference = CashCount.difference(this.countedAmount, this.expectedAmount);
        this.closedBy = closedBy;
        this.closingNotes = notes;
        this.closedAt = Instant.now();
    }
}
