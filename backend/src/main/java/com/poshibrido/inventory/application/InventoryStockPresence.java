package com.poshibrido.inventory.application;

import com.poshibrido.catalog.application.StockPresence;
import com.poshibrido.inventory.infrastructure.StockBalanceRepository;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class InventoryStockPresence implements StockPresence {

    private final StockBalanceRepository balances;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(readOnly = true)
    public boolean hasStock(UUID productId) {
        return balances.existsNonZero(productId);
    }

    @Override
    @Transactional
    @SuppressWarnings("unchecked")
    public void recordCostChange(UUID productId, BigDecimal oldCost, BigDecimal newCost, String reason) {
        List<Object[]> branches = em.createNativeQuery(
                        "SELECT branch_id, sum(quantity) FROM stock_balances WHERE product_id = ?1 GROUP BY branch_id")
                .setParameter(1, productId).getResultList();
        UUID actor = CurrentActor.userId().orElse(null);
        Instant now = Instant.now();
        for (Object[] b : branches) {
            em.createNativeQuery("""
                    INSERT INTO stock_movements (id, branch_id, product_id, type, quantity, unit_cost, balance_after,
                                                 reference_type, reference_id, reason, created_by, created_at)
                    VALUES (?1, ?2, ?3, 'COST_CHANGE', 0, ?4, ?5, 'PRODUCT', ?3, ?6, ?7, ?8)""")
                    .setParameter(1, Ids.newId()).setParameter(2, b[0]).setParameter(3, productId)
                    .setParameter(4, newCost).setParameter(5, b[1]).setParameter(6, reason).setParameter(7, actor)
                    .setParameter(8, now).executeUpdate();
        }
    }
}
