package com.poshibrido.inventory.domain;

public enum InventoryDocumentType {
    /** Saldo inicial de un producto en una sucursal (primer movimiento). */
    INITIAL,
    /** Ajuste manual de entrada o salida con motivo. */
    ADJUSTMENT,
    /** Traslado inmediato entre sucursales. */
    TRANSFER,
    /** Toma de inventario físico: genera ajustes por la diferencia. */
    COUNT
}
