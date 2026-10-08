package com.poshibrido.catalog.application;

import java.util.UUID;

/**
 * Si un producto tiene existencias distintas de cero en alguna sucursal. Lo implementa el módulo de inventario (el
 * catálogo no depende del inventario).
 */
public interface StockPresence {

    boolean hasStock(UUID productId);
}
