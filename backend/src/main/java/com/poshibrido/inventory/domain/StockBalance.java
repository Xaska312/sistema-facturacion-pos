package com.poshibrido.inventory.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Saldo de un producto en una sucursal (en unidad base). Solo lo modifica el ledger. */
@Getter
@Entity
@Table(name = "stock_balances")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StockBalance {

    @Id
    private UUID id;

    @Column(name = "branch_id", nullable = false, updatable = false)
    private UUID branchId;

    @Column(name = "product_id", nullable = false, updatable = false)
    private UUID productId;

    @Column(name = "lot_id", updatable = false)
    private UUID lotId;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal quantity;

    @Column(name = "min_stock", precision = 14, scale = 4)
    private BigDecimal minStock;

    @Column(name = "max_stock", precision = 14, scale = 4)
    private BigDecimal maxStock;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private Long version;

    public static UUID newId() {
        return Ids.newId();
    }

    void apply(BigDecimal delta) {
        this.quantity = this.quantity.add(delta);
        this.updatedAt = Instant.now();
    }

    public void setLevels(BigDecimal minStock, BigDecimal maxStock) {
        this.minStock = minStock;
        this.maxStock = maxStock;
        this.updatedAt = Instant.now();
    }

    /** Ajusta el saldo; solo lo llama el ledger al registrar un movimiento. */
    public BigDecimal applyMovement(BigDecimal delta) {
        apply(delta);
        return quantity;
    }
}
