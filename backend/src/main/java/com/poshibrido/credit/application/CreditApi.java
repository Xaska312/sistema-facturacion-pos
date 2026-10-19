package com.poshibrido.credit.application;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Lo que ventas necesita del fiado (decisión 255). Se llama dentro de la transacción de la venta o anulación,
 * después de bloquear la caja, el inventario y el consecutivo (orden de bloqueos del sistema).
 */
public interface CreditApi {

    /** Código del medio de pago "Fiado". */
    String METHOD_CODE = "CREDIT";

    /** Cliente al que se le fía, con lo que la venta ya cargó de él. */
    record Debtor(UUID customerId, String name, BigDecimal creditLimit) {
    }

    /**
     * Carga a la cuenta del cliente la parte fiada de una venta. Rechaza al Consumidor final, a quien no tiene cupo
     * y, sin el permiso credit:manage, lo que pase el cupo.
     */
    void chargeSale(Debtor debtor, BigDecimal amount, UUID saleId, UUID cashSessionId, UUID paymentMethodId);

    /** Devuelve lo fiado de una venta que se anula. No hace nada si la venta no se fió. */
    void reverseSale(UUID saleId);
}
