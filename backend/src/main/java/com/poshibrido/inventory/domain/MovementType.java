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
    RETURN(true);

    private final boolean entry;

    MovementType(boolean entry) {
        this.entry = entry;
    }

    public boolean isEntry() {
        return entry;
    }
}
