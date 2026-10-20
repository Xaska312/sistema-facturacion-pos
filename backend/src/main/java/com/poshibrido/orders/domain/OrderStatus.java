package com.poshibrido.orders.domain;

/** Estado de un pedido por encargo (decisión 258). */
public enum OrderStatus {
    /** Pendiente: falta entregar algo. */
    OPEN,
    /** Todo entregado. */
    DELIVERED,
    CANCELLED
}
