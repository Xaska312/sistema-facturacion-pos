package com.poshibrido.inventory.infrastructure;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Verificación del criterio de la Fase 4: el saldo de cada producto y sucursal es igual a la suma
 * de sus movimientos y al balance_after de su último movimiento.
 */
@Repository
public class InventoryConsistencyQueries {

    @PersistenceContext
    private EntityManager em;

    public record Mismatch(UUID branchId, UUID productId, BigDecimal balance, BigDecimal movementsSum,
                           BigDecimal lastBalanceAfter) {
    }

    @SuppressWarnings("unchecked")
    public List<Mismatch> mismatches() {
        List<Object[]> rows = em.createNativeQuery("""
                SELECT b.branch_id, b.product_id, b.quantity,
                       COALESCE(s.total, 0) AS total,
                       last.balance_after
                FROM stock_balances b
                LEFT JOIN (SELECT branch_id, product_id, SUM(quantity) AS total
                           FROM stock_movements WHERE lot_id IS NULL GROUP BY branch_id, product_id) s
                       ON s.branch_id = b.branch_id AND s.product_id = b.product_id
                LEFT JOIN LATERAL (SELECT m.balance_after FROM stock_movements m
                                   WHERE m.branch_id = b.branch_id AND m.product_id = b.product_id AND m.lot_id IS NULL
                                   ORDER BY m.entry_no DESC LIMIT 1) last ON TRUE
                WHERE b.lot_id IS NULL
                  AND (b.quantity <> COALESCE(s.total, 0)
                       OR (last.balance_after IS NOT NULL AND last.balance_after <> b.quantity))
                """).getResultList();
        return rows.stream().map(r -> new Mismatch((UUID) r[0], (UUID) r[1], (BigDecimal) r[2], (BigDecimal) r[3],
                (BigDecimal) r[4])).toList();
    }
}
