package com.poshibrido.inventory.application;

import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.inventory.domain.MovementType;
import com.poshibrido.inventory.domain.StockBalance;
import com.poshibrido.inventory.domain.StockMovement;
import com.poshibrido.inventory.infrastructure.StockBalanceRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Único punto que modifica existencias. Abre una sesión dentro de la transacción del caso de uso:
 * <ol>
 *   <li>Bloquea, en orden de id, los productos cuyo costo se recalcula (entradas con costo) y los que aún
 *   no tienen el costo manejado por el inventario.</li>
 *   <li>Crea los saldos que falten y los bloquea en orden (producto, sucursal).</li>
 *   <li>Cada {@link Session#post} actualiza el saldo e inserta el movimiento con {@code balance_after}.</li>
 * </ol>
 * Así el saldo siempre es igual a la suma de los movimientos y dos operaciones concurrentes sobre el
 * mismo producto y sucursal se serializan.
 */
@Component
public class StockLedger {

    @PersistenceContext
    private EntityManager em;

    private final StockBalanceRepository balances;
    private final InventoryCatalogApi catalog;

    public StockLedger(StockBalanceRepository balances, InventoryCatalogApi catalog) {
        this.balances = balances;
        this.catalog = catalog;
    }

    /**
     * @param costProductIds productos que tendrán entradas con costo (recalculan el promedio): se bloquean
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Session open(Collection<UUID> branchIds, Collection<UUID> productIds, Collection<UUID> costProductIds) {
        Set<UUID> products = new TreeSet<>(productIds);
        Set<UUID> branches = new TreeSet<>(branchIds);
        InventoryCatalogApi.LockedProducts loaded = catalog.loadForInventory(products, costProductIds);
        Map<UUID, StockProduct> info = loaded.products();
        for (UUID productId : products) {
            StockProduct p = info.get(productId);
            if (p == null) {
                throw new NotFoundException("Producto no encontrado.");
            }
            if (!p.active()) {
                throw new BusinessRuleException("El producto " + p.name() + " está inactivo.");
            }
            if (!p.trackInventory()) {
                throw new BusinessRuleException("El producto " + p.name() + " no controla inventario.");
            }
        }
        for (UUID productId : products) {
            for (UUID branchId : branches) {
                balances.ensureExists(StockBalance.newId(), branchId, productId);
            }
        }
        Map<String, StockBalance> locked = new HashMap<>();
        for (StockBalance b : balances.lockAll(products, branches)) {
            em.refresh(b);
            locked.put(key(b.getBranchId(), b.getProductId()), b);
        }
        return new Session(info, locked, loaded.locked());
    }

    private static String key(UUID branchId, UUID productId) {
        return branchId + "|" + productId;
    }

    /** Operación de inventario en curso (válida solo dentro de la transacción que la abrió). */
    public final class Session {

        private final Map<UUID, StockProduct> products;
        private final Map<String, StockBalance> balancesByKey;
        /** Productos con la fila bloqueada en esta transacción. */
        private final Set<UUID> costLocked;
        private final Map<UUID, BigDecimal> currentCost = new HashMap<>();
        private final Set<UUID> touched = new HashSet<>();
        private final List<StockMovement> movements = new ArrayList<>();
        private final UUID actor = CurrentActor.userId().orElse(null);

        private Session(Map<UUID, StockProduct> products, Map<String, StockBalance> balancesByKey, Set<UUID> costLocked) {
            this.products = products;
            this.balancesByKey = balancesByKey;
            this.costLocked = costLocked;
            products.forEach((id, p) -> currentCost.put(id, p.cost()));
        }

        public StockProduct product(UUID productId) {
            StockProduct p = products.get(productId);
            if (p == null) {
                throw new IllegalStateException("Producto fuera de la sesión de inventario: " + productId);
            }
            return p;
        }

        /** Saldo actual (bloqueado) en unidad base. */
        public BigDecimal balance(UUID branchId, UUID productId) {
            return balanceRow(branchId, productId).getQuantity();
        }

        public BigDecimal averageCost(UUID productId) {
            return currentCost.get(productId);
        }

        /**
         * Registra un movimiento.
         *
         * @param signedQuantity cantidad en unidad base, positiva para entradas y negativa para salidas
         * @param entryCost      costo unitario de una entrada que recalcula el promedio (saldo inicial,
         *                       compra, ajuste con costo); {@code null} = se valora al costo promedio actual
         * @param allowNegative  si la salida puede dejar el saldo negativo (ventas con ese ajuste activo)
         */
        public StockMovement post(UUID branchId, UUID productId, MovementType type, BigDecimal signedQuantity,
                                  BigDecimal entryCost, boolean allowNegative, String referenceType,
                                  UUID referenceId, String reason) {
            if (signedQuantity.signum() == 0 || (signedQuantity.signum() > 0) != type.isEntry()) {
                throw new IllegalArgumentException("Signo de cantidad inválido para " + type);
            }
            StockProduct product = product(productId);
            StockBalance balance = balanceRow(branchId, productId);

            BigDecimal unitCost;
            if (entryCost != null) {
                if (!type.isEntry() || !costLocked.contains(productId)) {
                    throw new IllegalStateException("Entrada con costo sin bloquear el producto " + productId);
                }
                em.flush();
                BigDecimal total = balances.totalQuantity(productId);
                BigDecimal average = weightedAverage(total, currentCost.get(productId), signedQuantity, entryCost);
                currentCost.put(productId, average);
                catalog.setAverageCost(productId, average);
                unitCost = entryCost.setScale(2, RoundingMode.HALF_UP);
            } else {
                unitCost = currentCost.get(productId);
            }

            BigDecimal after = balance.getQuantity().add(signedQuantity);
            if (after.signum() < 0 && !allowNegative) {
                throw new BusinessRuleException("Existencias insuficientes de " + product.name() + ": disponible "
                        + balance.getQuantity().stripTrailingZeros().toPlainString() + " " + product.baseUnitCode()
                        + ", se requieren " + signedQuantity.negate().stripTrailingZeros().toPlainString() + ".");
            }
            balance.applyMovement(signedQuantity);
            StockMovement movement = StockMovement.record(branchId, productId, type, signedQuantity, unitCost,
                    balance.getQuantity(), referenceType, referenceId, reason, actor);
            em.persist(movement);
            movements.add(movement);
            if (touched.add(productId) && costLocked.contains(productId)) {
                // Solo los productos bloqueados pueden tener el costo aún sin marcar.
                catalog.lockCost(productId);
            }
            return movement;
        }

        public List<StockMovement> movements() {
            return List.copyOf(movements);
        }

        private StockBalance balanceRow(UUID branchId, UUID productId) {
            StockBalance b = balancesByKey.get(key(branchId, productId));
            if (b == null) {
                throw new IllegalStateException("Saldo fuera de la sesión de inventario: " + branchId + "/" + productId);
            }
            return b;
        }
    }

    /**
     * Promedio ponderado: (existencia × costo actual + cantidad × costo de entrada) / (existencia + cantidad).
     * Si la existencia total es cero o negativa, el nuevo costo es el de la entrada.
     */
    static BigDecimal weightedAverage(BigDecimal totalQuantity, BigDecimal currentCost, BigDecimal entryQuantity,
                                      BigDecimal entryCost) {
        if (totalQuantity.signum() <= 0) {
            return entryCost.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal value = totalQuantity.multiply(currentCost).add(entryQuantity.multiply(entryCost));
        return value.divide(totalQuantity.add(entryQuantity), 2, RoundingMode.HALF_UP);
    }
}
