package com.poshibrido.inventory.application;

import java.math.BigDecimal;
import java.time.LocalDate;
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
     * @param lotNumber lote (Fase 13-3): obligatorio en entradas de productos que controlan lotes; en salidas, de ese
     *                  lote (sin él, FEFO); en conteos, el saldo de ese lote (sin él, lo que no tiene lote)
     * @param expirationDate vencimiento del lote: obligatorio si el lote es nuevo
     */
    public record Line(UUID productId, UUID unitId, BigDecimal quantity, Direction direction, BigDecimal unitCost,
                       BigDecimal expectedQuantity, String lotNumber, LocalDate expirationDate) {

        public Line(UUID productId, UUID unitId, BigDecimal quantity, Direction direction, BigDecimal unitCost,
                    BigDecimal expectedQuantity) {
            this(productId, unitId, quantity, direction, unitCost, expectedQuantity, null, null);
        }
    }

    public record Initial(UUID branchId, String notes, List<Line> lines) {
    }

    public record Adjustment(UUID branchId, String reason, String notes, List<Line> lines) {
    }

    public record Transfer(UUID fromBranchId, UUID toBranchId, String notes, List<Line> lines) {
    }

    public record Count(UUID branchId, String reason, String notes, List<Line> lines) {
    }

    /** Baja de vencidos o averiados con acta (Fase 13-3). */
    public record Disposal(UUID branchId, String reason, String disposalMethod, String witnessName, String notes,
                           List<Line> lines) {
    }
}
