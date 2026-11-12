package com.poshibrido.catalog.application;

import java.util.UUID;

/**
 * Si un producto tiene existencias distintas de cero en alguna sucursal. Lo implementa el módulo de inventario (el
 * catálogo no depende del inventario).
 */
public interface StockPresence {

    boolean hasStock(UUID productId);

    /**
     * Cambio del costo de un producto que ya maneja el inventario (decisión 334): deja un renglón "Cambio de costo" en el
     * kardex de cada sede donde tiene saldo, sin mover existencias.
     */
    void recordCostChange(UUID productId, java.math.BigDecimal oldCost, java.math.BigDecimal newCost, String reason);
}
