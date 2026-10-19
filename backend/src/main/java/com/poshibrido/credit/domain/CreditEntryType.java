package com.poshibrido.credit.domain;

/** Movimientos de la cuenta de fiado de un cliente. Los que aumentan la deuda son positivos y los demás negativos. */
public enum CreditEntryType {
    /** Parte fiada de una venta. */
    SALE(true),
    /** Anulación de una venta fiada: devuelve lo fiado. */
    SALE_VOID(false),
    /** Abono del cliente. */
    PAYMENT(false),
    /** Anulación de un abono: la deuda vuelve a subir. */
    PAYMENT_VOID(true);

    private final boolean increasesDebt;

    CreditEntryType(boolean increasesDebt) {
        this.increasesDebt = increasesDebt;
    }

    public boolean increasesDebt() {
        return increasesDebt;
    }
}
