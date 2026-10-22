package com.poshibrido.quotes.domain;

/** Estado guardado de una cotización. "Vencida" no se guarda: es una abierta con la fecha de validez pasada. */
public enum QuoteStatus {
    OPEN,
    /** Aceptada y convertida en un pedido o en una venta. */
    ACCEPTED,
    REJECTED
}
