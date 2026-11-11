package com.poshibrido.sales.application;

import com.poshibrido.finance.application.WithholdingApi;

import com.poshibrido.pharmacy.application.DispensationRules;
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
                           BigDecimal expectedUnitPrice, List<ModifierChoices.Choice> modifiers, String note) {

        /**
         * Sin adiciones ni nota (pedidos y cotizaciones). {@code expectedUnitPrice} es el precio del producto sin
         * adiciones: el valor de las adiciones lo pone el servidor (un cambio se detecta con el total esperado).
         */
        public ItemLine(UUID productId, UUID unitId, BigDecimal quantity, BigDecimal discountPercent,
                        BigDecimal expectedUnitPrice) {
            this(productId, unitId, quantity, discountPercent, expectedUnitPrice, List.of(), null);
        }
    }

    /**
     * {@code amount} es lo entregado con ese medio (en efectivo puede superar lo que falta: hay cambio).
     * {@code withholdings}: solo en la línea del medio "Retención" (decisión 322), el detalle de lo que retuvo el
     * cliente.
     */
    public record PaymentLine(UUID paymentMethodId, BigDecimal amount, String reference,
                              List<WithholdingApi.Line> withholdings) {

        public PaymentLine(UUID paymentMethodId, BigDecimal amount, String reference) {
            this(paymentMethodId, amount, reference, List.of());
        }
    }

    /**
     * Propina voluntaria (Fase 12b-5): aparte de la venta (no suma al total ni lleva impuestos). Se paga con uno de los
     * medios de la venta: los pagos cubren el total más la propina. {@code suggestedPercent}: el sugerido si se aceptó.
     */
    public record Tip(BigDecimal amount, UUID paymentMethodId, Integer suggestedPercent) {
    }

    /**
     * @param customerId    nulo = consumidor final
     * @param expectedTotal total que mostró la pantalla (opcional)
     * @param tip           propina (solo al cobrar una cuenta de mesa) o nula
     * @param dispensation  confirmación de la fórmula (Fase 13-4) si la venta lleva medicamentos bajo fórmula
     */
    public record Create(UUID customerId, List<ItemLine> items, List<PaymentLine> payments, BigDecimal expectedTotal,
                         String notes, Tip tip, DispensationRules.Dispensation dispensation) {

        public Create(UUID customerId, List<ItemLine> items, List<PaymentLine> payments, BigDecimal expectedTotal,
                      String notes, Tip tip) {
            this(customerId, items, payments, expectedTotal, notes, tip, null);
        }

        public Create(UUID customerId, List<ItemLine> items, List<PaymentLine> payments, BigDecimal expectedTotal,
                      String notes) {
            this(customerId, items, payments, expectedTotal, notes, null, null);
        }
    }
}
