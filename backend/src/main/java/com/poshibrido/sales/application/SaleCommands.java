package com.poshibrido.sales.application;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Datos que envía el punto de venta. Precios y totales esperados solo sirven para detectar cambios. */
public final class SaleCommands {

    private SaleCommands() {
    }

    /**
     * @param unitId            nula = unidad base
     * @param discountPercent   nulo = sin descuento
     * @param expectedUnitPrice precio que mostró la pantalla; si difiere del vigente, la venta se rechaza (409)
     */
    public record ItemLine(UUID productId, UUID unitId, BigDecimal quantity, BigDecimal discountPercent,
                           BigDecimal expectedUnitPrice) {
    }

    /** {@code amount} es lo entregado con ese medio (en efectivo puede superar lo que falta: hay cambio). */
    public record PaymentLine(UUID paymentMethodId, BigDecimal amount, String reference) {
    }

    /**
     * @param customerId    nulo = consumidor final
     * @param expectedTotal total que mostró la pantalla (opcional)
     */
    public record Create(UUID customerId, List<ItemLine> items, List<PaymentLine> payments, BigDecimal expectedTotal,
                         String notes) {
    }
}
