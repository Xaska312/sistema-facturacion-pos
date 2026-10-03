package com.poshibrido.cash.domain;

/** Tipos de movimiento de efectivo. Los de entrada son positivos y los de salida negativos. */
public enum CashMovementType {
    SALE(true),
    SALE_VOID(false),
    INCOME(true),
    EXPENSE(false),
    WITHDRAWAL(false);

    private final boolean entry;

    CashMovementType(boolean entry) {
        this.entry = entry;
    }

    public boolean isEntry() {
        return entry;
    }

    /** Los que registra el cajero a mano (las ventas y anulaciones los generan solas). */
    public boolean isManual() {
        return this == INCOME || this == EXPENSE || this == WITHDRAWAL;
    }
}
