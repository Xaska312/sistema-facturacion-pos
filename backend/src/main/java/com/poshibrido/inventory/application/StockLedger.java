package com.poshibrido.inventory.application;

import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.inventory.domain.MovementType;
import com.poshibrido.inventory.domain.StockBalance;
import com.poshibrido.inventory.domain.StockMovement;
import com.poshibrido.inventory.infrastructure.StockBalanceRepository;
import com.poshibrido.organization.application.BusinessSettingsApi;
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
import java.sql.Date;
import java.time.LocalDate;
import java.time.ZoneId;
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
    private final BusinessSettingsApi settings;

    public StockLedger(StockBalanceRepository balances, InventoryCatalogApi catalog, BusinessSettingsApi settings) {
        this.balances = balances;
        this.catalog = catalog;
        this.settings = settings;
    }

    /** Hoy en la zona horaria del negocio (para saber qué lote está vencido). */
    public LocalDate today() {
        return LocalDate.now(ZoneId.of(settings.current().timezone()));
    }

    /** Parte de una salida: de un lote o sin lote ({@code lotId} nulo). */
    public record Portion(UUID lotId, BigDecimal quantity) {
    }

    /**
     * @param costProductIds productos que tendrán entradas con costo (recalculan el promedio): se bloquean
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Session open(Collection<UUID> branchIds, Collection<UUID> productIds, Collection<UUID> costProductIds) {
        return open(branchIds, productIds, costProductIds, false);
    }

    /**
     * @param reversal reverso de un documento ya registrado (anulación de venta): no exige que el producto siga
     *                 activo ni que siga controlando inventario, porque devuelve lo que ya salió
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Session open(Collection<UUID> branchIds, Collection<UUID> productIds, Collection<UUID> costProductIds,
                        boolean reversal) {
        Set<UUID> products = new TreeSet<>(productIds);
        Set<UUID> branches = new TreeSet<>(branchIds);
        InventoryCatalogApi.LockedProducts loaded = catalog.loadForInventory(products, costProductIds);
        Map<UUID, StockProduct> info = loaded.products();
        for (UUID productId : products) {
            StockProduct p = info.get(productId);
            if (p == null) {
                throw new NotFoundException("Producto no encontrado.");
            }
            if (reversal) {
                continue;
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
            return post(branchId, productId, null, type, signedQuantity, entryCost, allowNegative, referenceType,
                    referenceId, reason);
        }

        /**
         * Igual que el otro {@code post}, de un lote (Fase 13-2): además del saldo del producto mueve el saldo del lote
         * en la sucursal ({@code lot_balances}, que no puede quedar negativo). El saldo del producto ya está bloqueado,
         * así que el del lote también queda serializado.
         */
        public StockMovement post(UUID branchId, UUID productId, UUID lotId, MovementType type,
                                  BigDecimal signedQuantity, BigDecimal entryCost, boolean allowNegative,
                                  String referenceType, UUID referenceId, String reason) {
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
            StockMovement movement = StockMovement.record(branchId, productId, lotId, type, signedQuantity, unitCost,
                    balance.getQuantity(), referenceType, referenceId, reason, actor);
            em.persist(movement);
            if (lotId != null) {
                moveLot(branchId, productId, lotId, signedQuantity, product.name());
            }
            movements.add(movement);
            if (touched.add(productId) && costLocked.contains(productId)) {
                // Solo los productos bloqueados pueden tener el costo aún sin marcar.
                catalog.lockCost(productId);
            }
            return movement;
        }

        private void moveLot(UUID branchId, UUID productId, UUID lotId, BigDecimal signedQuantity, String name) {
            if (signedQuantity.signum() < 0) {
                List<?> current = em.createNativeQuery(
                        "SELECT quantity FROM lot_balances WHERE branch_id = ?1 AND lot_id = ?2 FOR UPDATE")
                        .setParameter(1, branchId).setParameter(2, lotId).getResultList();
                BigDecimal available = current.isEmpty() ? BigDecimal.ZERO : (BigDecimal) current.getFirst();
                if (available.add(signedQuantity).signum() < 0) {
                    throw new BusinessRuleException("No hay suficiente de " + name + " en ese lote: disponible "
                            + available.stripTrailingZeros().toPlainString() + ".");
                }
                // Salida: UPDATE (un INSERT con cantidad negativa violaría el CHECK antes del ON CONFLICT).
                em.createNativeQuery("""
                        UPDATE lot_balances SET quantity = quantity + ?3, updated_at = now()
                        WHERE branch_id = ?1 AND lot_id = ?2""")
                        .setParameter(1, branchId).setParameter(2, lotId).setParameter(3, signedQuantity)
                        .executeUpdate();
                return;
            }
            em.createNativeQuery("""
                    INSERT INTO lot_balances (branch_id, product_id, lot_id, quantity, updated_at)
                    VALUES (?1, ?2, ?3, ?4, now())
                    ON CONFLICT (branch_id, lot_id) DO UPDATE
                    SET quantity = lot_balances.quantity + excluded.quantity, updated_at = now()""")
                    .setParameter(1, branchId).setParameter(2, productId).setParameter(3, lotId)
                    .setParameter(4, signedQuantity).executeUpdate();
        }

        /**
         * Salida de un producto (Fase 13-3, decisión 281). Si controla lotes, reparte con FEFO: primero lo que no tiene
         * lote (existencias de antes de controlar lotes), luego el lote que vence primero. Un lote vencido nunca sale
         * por aquí salvo {@code allowExpired} (bajas y ajustes). Un movimiento por cada parte.
         *
         * @param quantity cantidad positiva en unidad base
         */
        public List<StockMovement> postOut(UUID branchId, UUID productId, MovementType type, BigDecimal quantity,
                                           boolean allowNegative, boolean allowExpired, String referenceType,
                                           UUID referenceId, String reason) {
            List<StockMovement> result = new ArrayList<>();
            for (Portion p : allocate(branchId, productId, quantity, allowExpired)) {
                result.add(post(branchId, productId, p.lotId(), type, p.quantity().negate(), null, allowNegative,
                        referenceType, referenceId, reason));
            }
            return result;
        }

        /** Cómo se repartiría una salida entre "sin lote" y los lotes, sin mover nada (FEFO). */
        public List<Portion> allocate(UUID branchId, UUID productId, BigDecimal quantity, boolean allowExpired) {
            StockProduct product = product(productId);
            if (!product.tracksLots()) {
                return List.of(new Portion(null, quantity));
            }
            List<?> rows = em.createNativeQuery("""
                    SELECT b.lot_id, b.quantity, l.expiration_date, l.lot_number
                    FROM lot_balances b JOIN lots l ON l.id = b.lot_id
                    WHERE b.branch_id = ?1 AND b.product_id = ?2 AND b.quantity > 0
                    ORDER BY l.expiration_date NULLS LAST, l.lot_number
                    FOR UPDATE OF b""").setParameter(1, branchId).setParameter(2, productId).getResultList();
            BigDecimal inLots = BigDecimal.ZERO;
            for (Object row : rows) {
                inLots = inLots.add((BigDecimal) ((Object[]) row)[1]);
            }
            List<Portion> portions = new ArrayList<>();
            BigDecimal remaining = quantity;
            BigDecimal unlotted = balance(branchId, productId).subtract(inLots).max(BigDecimal.ZERO);
            if (unlotted.signum() > 0) {
                BigDecimal take = unlotted.min(remaining);
                portions.add(new Portion(null, take));
                remaining = remaining.subtract(take);
            }
            LocalDate today = today();
            BigDecimal expired = BigDecimal.ZERO;
            String expiredLot = null;
            for (Object o : rows) {
                if (remaining.signum() <= 0) {
                    break;
                }
                Object[] row = (Object[]) o;
                BigDecimal available = (BigDecimal) row[1];
                LocalDate expiration = toDate(row[2]);
                if (!allowExpired && expiration != null && !expiration.isAfter(today)) {
                    expired = expired.add(available);
                    expiredLot = expiredLot == null ? (String) row[3] : expiredLot;
                    continue;
                }
                BigDecimal take = available.min(remaining);
                portions.add(new Portion((UUID) row[0], take));
                remaining = remaining.subtract(take);
            }
            if (remaining.signum() > 0) {
                if (expired.signum() > 0) {
                    throw new BusinessRuleException("Lo que queda de " + product.name() + " está vencido (lote "
                            + expiredLot + "): no se puede vender ni trasladar. Dale de baja en Vencimientos.");
                }
                // Sin lotes disponibles: lo que falta sale "sin lote" (el saldo decide si alcanza o queda negativo).
                portions.add(new Portion(null, remaining));
            }
            return mergeUnlotted(portions);
        }

        /** Saldo de un lote en la sucursal (0 si no tiene). */
        public BigDecimal lotBalance(UUID branchId, UUID lotId) {
            List<?> rows = em.createNativeQuery(
                    "SELECT quantity FROM lot_balances WHERE branch_id = ?1 AND lot_id = ?2")
                    .setParameter(1, branchId).setParameter(2, lotId).getResultList();
            return rows.isEmpty() ? BigDecimal.ZERO : ((BigDecimal) rows.getFirst()).setScale(4, RoundingMode.HALF_UP);
        }

        /** Existencia sin lote: el saldo del producto menos lo que está en lotes (nunca negativa). */
        public BigDecimal unlottedBalance(UUID branchId, UUID productId) {
            Object inLots = em.createNativeQuery(
                    "SELECT coalesce(sum(quantity), 0) FROM lot_balances WHERE branch_id = ?1 AND product_id = ?2")
                    .setParameter(1, branchId).setParameter(2, productId).getSingleResult();
            return balance(branchId, productId).subtract((BigDecimal) inLots).max(BigDecimal.ZERO)
                    .setScale(4, RoundingMode.HALF_UP);
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

    private static List<Portion> mergeUnlotted(List<Portion> portions) {
        BigDecimal unlotted = BigDecimal.ZERO;
        List<Portion> lots = new ArrayList<>();
        for (Portion p : portions) {
            if (p.lotId() == null) {
                unlotted = unlotted.add(p.quantity());
            } else {
                lots.add(p);
            }
        }
        List<Portion> result = new ArrayList<>();
        if (unlotted.signum() > 0) {
            result.add(new Portion(null, unlotted));
        }
        result.addAll(lots);
        return result;
    }

    static LocalDate toDate(Object value) {
        return value == null ? null : value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }
}
