package com.poshibrido.inventory.domain;

/** Tipos de movimiento del kardex. Las entradas suman y las salidas restan (signo en la cantidad). */
public enum MovementType {
    INITIAL(true),
    PURCHASE(true),
    SALE(false),
    SALE_VOID(true),
    ADJUSTMENT_IN(true),
    ADJUSTMENT_OUT(false),
    TRANSFER_OUT(false),
    TRANSFER_IN(true),
    RETURN(true),
    /** Baja de vencidos o averiados (Fase 13-3). */
    DISPOSAL(false),
    /** Devolución al proveedor de lo comprado (Fase 13-3). */
    SUPPLIER_RETURN(false);

    private final boolean entry;

    MovementType(boolean entry) {
        this.entry = entry;
    }

    public boolean isEntry() {
        return entry;
    }
}
