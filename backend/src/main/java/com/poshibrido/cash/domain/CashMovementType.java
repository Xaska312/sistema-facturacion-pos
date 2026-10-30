package com.poshibrido.cash.domain;

/** Tipos de movimiento de efectivo. Los de entrada son positivos y los de salida negativos. */
public enum CashMovementType {
    SALE(true),
    SALE_VOID(false),
    INCOME(true),
    EXPENSE(false),
    WITHDRAWAL(false),
    /** Abono en efectivo de un cliente a su fiado (decisión 255). */
    CREDIT_PAYMENT(true),
    /** Anulación de un abono en efectivo: el dinero sale de la caja. */
    CREDIT_PAYMENT_VOID(false),
    /** Anticipo en efectivo de un pedido por encargo (decisión 258). */
    ORDER_PAYMENT(true),
    /** Devolución en efectivo del anticipo de un pedido cancelado. */
    ORDER_REFUND(false),
    /** Propina en efectivo de una venta (Fase 12b-5): es del equipo, no del negocio. */
    TIP(true),
    /** Propina en efectivo de una venta anulada: sale de la caja. */
    TIP_VOID(false),
    /** Entrega de propinas al equipo desde la caja. */
    TIP_PAYOUT(false);

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
