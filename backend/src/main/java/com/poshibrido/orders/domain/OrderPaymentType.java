package com.poshibrido.orders.domain;

/** Movimientos del anticipo de un pedido. Positivos aumentan lo anticipado disponible; negativos lo reducen. */
public enum OrderPaymentType {
    /** Anticipo o abono del cliente. */
    DEPOSIT(true),
    /** Devolución de lo anticipado (al cancelar). */
    REFUND(false),
    /** Lo anticipado que se aplicó a la venta de una entrega. */
    APPLIED(false),
    /** Se anuló la venta de una entrega: lo aplicado vuelve a estar disponible. */
    APPLIED_VOID(true);

    private final boolean positive;

    OrderPaymentType(boolean positive) {
        this.positive = positive;
    }

    public boolean isPositive() {
        return positive;
    }
}
