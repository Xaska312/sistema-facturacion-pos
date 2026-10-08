package com.poshibrido.inventory.application;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Comandos de los documentos de inventario. Las cantidades van en la unidad indicada (nula = base). */
public final class InventoryCommands {

    private InventoryCommands() {
    }

    public enum Direction {
        IN, OUT
    }

    /**
     * @param quantity  cantidad (en conteos: cantidad contada)
     * @param direction solo ajustes
     * @param unitCost  costo por unidad indicada: obligatorio en saldo inicial (nulo = costo actual),
     *                  opcional en entradas de ajuste (recalcula el promedio)
     * @param expectedQuantity solo conteos: existencia (unidad base) que el sistema mostraba al empezar a contar ese
     *                  producto. Si viene, se ajusta la diferencia contra ella y no contra el saldo actual: las ventas
     *                  hechas durante el conteo no se "devuelven" (QA INV-2). Sin ella, contra el saldo actual.
     */
    public record Line(UUID productId, UUID unitId, BigDecimal quantity, Direction direction, BigDecimal unitCost,
                       BigDecimal expectedQuantity) {
    }

    public record Initial(UUID branchId, String notes, List<Line> lines) {
    }

    public record Adjustment(UUID branchId, String reason, String notes, List<Line> lines) {
    }

    public record Transfer(UUID fromBranchId, UUID toBranchId, String notes, List<Line> lines) {
    }

    public record Count(UUID branchId, String reason, String notes, List<Line> lines) {
    }
}
