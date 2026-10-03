package com.poshibrido.catalog.application;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Lo que el inventario necesita del catálogo: datos de producto, factores de unidad y costo promedio. */
public interface InventoryCatalogApi {

    /**
     * @param factors factor a unidad base por unidad (incluye la base con factor 1)
     * @param units   código de cada unidad de {@code factors}
     */
    record StockProduct(UUID id, String sku, String name, boolean active, boolean trackInventory, UUID baseUnitId,
                        String baseUnitCode, boolean baseUnitAllowsDecimals, BigDecimal cost,
                        Map<UUID, BigDecimal> factors, Map<UUID, String> units) {
    }

    Map<UUID, StockProduct> stockProducts(Collection<UUID> productIds);

    /** Productos para una operación de inventario y cuáles quedaron bloqueados. */
    record LockedProducts(Map<UUID, StockProduct> products, Set<UUID> locked) {
    }

    /**
     * Carga los productos de una operación de inventario. Antes de leerlos bloquea, en orden de id, los que
     * recalculan su costo ({@code costProductIds}) y los que aún no tienen el costo manejado por el inventario
     * (su primer movimiento lo marca). Debe llamarse dentro de una transacción, antes de bloquear saldos.
     */
    LockedProducts loadForInventory(Collection<UUID> productIds, Collection<UUID> costProductIds);

    /** Fija el costo promedio ponderado y marca el costo como manejado por el inventario. */
    void setAverageCost(UUID productId, BigDecimal averageCost);

    /** Marca el costo como manejado por el inventario (tras el primer movimiento). */
    void lockCost(UUID productId);

    /** Productos activos que controlan inventario, por nombre, SKU o código exacto. */
    Page<StockProduct> searchTracked(String search, UUID categoryId, Pageable pageable);
}
