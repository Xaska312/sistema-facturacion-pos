package com.poshibrido.finance.application;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Retenciones que hace el cliente al pagar (decisión 322), para ventas y pedidos. La retención entra como una línea de
 * pago con el medio {@value #METHOD_CODE} (no mueve la caja); aquí se valida y se guarda su detalle.
 */
public interface WithholdingApi {

    String METHOD_CODE = "WITHHOLDING";

    /**
     * Una retención: {@code type} RETEFUENTE, RETEICA o RETEIVA; {@code rate} en porcentaje (6 = 6 %; reteICA de 9,66
     * por mil = 0.966) o nula si se escribió el valor directo.
     */
    record Line(String type, BigDecimal base, BigDecimal rate, BigDecimal amount) {
    }

    /** De lo que se cobra ahora: la base gravable (sin impuestos) y el IVA. */
    record Bases(BigDecimal base, BigDecimal iva) {
    }

    /**
     * Valida las retenciones de una línea de pago y las devuelve listas para guardar. Sin {@code finance:manage}, solo
     * las de la ficha del cliente, con su tarifa y sobre {@code bases} (retefuente y reteICA sobre la base, reteIVA
     * sobre el IVA). {@code lineAmount}: lo que dice la línea de pago (la suma debe dar eso).
     */
    List<Line> check(UUID customerId, Bases bases, List<Line> lines, BigDecimal lineAmount);

    /**
     * Como {@link #check} pero para un abono: {@code paid} es lo que pagó el cliente y la base sale del abono completo
     * (lo pagado más lo retenido), que se despeja: {@code basesOf} da las bases de un abono completo.
     */
    List<Line> checkOnPayment(UUID customerId, java.util.function.Function<BigDecimal, Bases> basesOf, BigDecimal paid,
                              List<Line> lines);

    void recordForSale(UUID saleId, int paymentLineNo, UUID customerId, List<Line> lines);

    void recordForOrderPayment(UUID orderId, UUID orderPaymentId, UUID customerId, List<Line> lines);

    /** Lo retenido en los abonos del pedido que no se ha reversado. */
    BigDecimal orderWithheld(UUID orderId);

    /** Reversa (al cancelar el pedido) {@code amount} de lo retenido en sus abonos, repartido por tipo. */
    void reverseForOrder(UUID orderId, UUID refundPaymentId, BigDecimal amount);
}
