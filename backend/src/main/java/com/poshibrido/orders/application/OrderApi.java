package com.poshibrido.orders.application;

import java.util.UUID;

/** Lo que ventas necesita de los pedidos por encargo (decisión 258). */
public interface OrderApi {

    /**
     * Se anula una venta: si fue la entrega de un pedido, sus líneas vuelven a quedar pendientes y lo anticipado que se
     * le aplicó vuelve a estar disponible. Se llama dentro de la anulación, después de bloquear la venta y la caja y
     * antes del inventario (orden de bloqueos).
     */
    void saleVoided(UUID saleId);
}
