package com.poshibrido.inventory.application;

import com.poshibrido.inventory.domain.InventoryDocumentType;
import com.poshibrido.inventory.domain.MovementType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Vistas de lectura del inventario. */
public final class InventoryViews {

    private InventoryViews() {
    }

    public enum StockStatus {
        /** En o por debajo del mínimo. */
        LOW,
        OK,
        /** Por encima del máximo. */
        OVER
    }

    public record StockRow(UUID branchId, UUID productId, String sku, String name, String unitCode,
                           BigDecimal quantity, BigDecimal minStock, BigDecimal maxStock, StockStatus status,
                           BigDecimal averageCost, BigDecimal stockValue) {
    }

    public record AlertRow(UUID branchId, String branchName, UUID productId, String sku, String name, String unitCode,
                           BigDecimal quantity, BigDecimal minStock) {
    }

    public record KardexRow(long entryNo, Instant createdAt, UUID branchId, String branchName, MovementType type,
                            BigDecimal quantity, BigDecimal unitCost, BigDecimal balanceAfter, String referenceType,
                            UUID referenceId, Long documentNumber, String reason, String createdByName) {
    }

    public record DocumentLineView(int lineNo, UUID productId, String sku, String name, UUID unitId, String unitCode,
                                   BigDecimal quantity, BigDecimal factor, BigDecimal baseQuantity, String direction,
                                   BigDecimal unitCost, BigDecimal expectedQuantity, BigDecimal countedQuantity,
                                   BigDecimal difference) {
    }

    public record DocumentView(UUID id, long number, InventoryDocumentType type, UUID branchId, String branchName,
                               UUID targetBranchId, String targetBranchName, String reason, String notes,
                               UUID createdBy, String createdByName, Instant createdAt, int lineCount,
                               List<DocumentLineView> lines) {
    }
}
