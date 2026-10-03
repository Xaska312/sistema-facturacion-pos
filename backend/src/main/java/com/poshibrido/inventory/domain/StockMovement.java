package com.poshibrido.inventory.domain;

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
import java.time.Instant;
import java.util.UUID;

/** Movimiento del kardex. Inmutable: la base de datos rechaza UPDATE y DELETE. */
@Getter
@Entity
@Immutable
@Table(name = "stock_movements")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StockMovement {

    @Id
    private UUID id;

    /** Consecutivo asignado por la base de datos al insertar (orden del kardex). */
    @Column(name = "entry_no", insertable = false, updatable = false)
    private Long entryNo;

    @Column(name = "branch_id", nullable = false)
    private UUID branchId;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "lot_id")
    private UUID lotId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MovementType type;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal quantity;

    @Column(name = "unit_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitCost;

    @Column(name = "balance_after", nullable = false, precision = 14, scale = 4)
    private BigDecimal balanceAfter;

    @Column(name = "reference_type", nullable = false)
    private String referenceType;

    @Column(name = "reference_id", nullable = false)
    private UUID referenceId;

    @Column
    private String reason;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public static StockMovement record(UUID branchId, UUID productId, MovementType type, BigDecimal quantity,
                                       BigDecimal unitCost, BigDecimal balanceAfter, String referenceType,
                                       UUID referenceId, String reason, UUID createdBy) {
        StockMovement m = new StockMovement();
        m.id = Ids.newId();
        m.branchId = branchId;
        m.productId = productId;
        m.type = type;
        m.quantity = quantity;
        m.unitCost = unitCost;
        m.balanceAfter = balanceAfter;
        m.referenceType = referenceType;
        m.referenceId = referenceId;
        m.reason = reason;
        m.createdBy = createdBy;
        m.createdAt = Instant.now();
        return m;
    }
}
