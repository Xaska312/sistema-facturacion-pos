package com.poshibrido.sales.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Reglas de cálculo de una venta (sin estado; las mismas en el frontend para mostrar el total antes de cobrar).
 *
 * <p><b>Pesos enteros</b> (decisión del usuario, QA DIN-2): en Colombia el efectivo no tiene centavos, así que el
 * total de cada línea se redondea al peso (HALF_UP). Si no, se guardaban centavos que la pantalla redondeaba: el
 * cajero entregaba $1 de más de cambio o veía "Falta $ 0". Por línea:
 * <ul>
 *   <li>bruto = pesos(precio × cantidad); descuento = pesos(bruto × % / 100); neto = bruto − descuento.</li>
 *   <li>Precios con IVA incluido: total = neto; base = total / (1 + tarifa) a 2 decimales; impuesto = total − base.</li>
 *   <li>Precios sin IVA: base = neto; total = pesos(base × (1 + tarifa)); impuesto = total − base.</li>
 * </ul>
 * Base e impuesto pueden tener centavos (información tributaria), pero suman exactamente el total. Los totales de la
 * venta son la suma de las líneas: siempre pesos enteros, igual que los pagos.
 */
public final class SaleCalculator {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private SaleCalculator() {
    }

    public record LineAmounts(BigDecimal gross, BigDecimal discount, BigDecimal taxableBase, BigDecimal tax,
                              BigDecimal total) {
    }

    /**
     * @param taxRate tarifa en porcentaje (19 = 19 %)
     */
    public static LineAmounts line(BigDecimal unitPrice, BigDecimal quantity, BigDecimal discountPercent,
                                   BigDecimal taxRate, boolean pricesIncludeTax) {
        BigDecimal gross = pesos(unitPrice.multiply(quantity));
        BigDecimal discount = pesos(gross.multiply(discountPercent).divide(HUNDRED, 10, RoundingMode.HALF_UP));
        BigDecimal net = gross.subtract(discount);
        BigDecimal rate = taxRate.divide(HUNDRED, 10, RoundingMode.HALF_UP);
        if (pricesIncludeTax) {
            BigDecimal base = net.divide(BigDecimal.ONE.add(rate), 2, RoundingMode.HALF_UP);
            return new LineAmounts(gross, discount, base, net.subtract(base), net);
        }
        BigDecimal total = pesos(net.multiply(BigDecimal.ONE.add(rate)));
        return new LineAmounts(gross, discount, net, total.subtract(net), total);
    }

    /** Pago informado: {@code tendered} es lo que entrega el cliente con ese medio. */
    public record PaymentInput(boolean affectsCash, BigDecimal tendered) {
    }

    /**
     * @param applied lo aplicado de cada pago, en el mismo orden (el cambio se descuenta del efectivo)
     */
    public record Settlement(List<BigDecimal> applied, BigDecimal paidTotal, BigDecimal change, BigDecimal cashNet) {
    }

    /**
     * Liquida los pagos: la suma debe cubrir el total y el cambio solo sale del efectivo, así que los pagos que no
     * son en efectivo no pueden superar el total.
     *
     * @throws IllegalArgumentException con un mensaje para el usuario si los pagos no son válidos
     */
    public static Settlement settle(BigDecimal total, List<PaymentInput> payments) {
        BigDecimal paid = BigDecimal.ZERO;
        BigDecimal nonCash = BigDecimal.ZERO;
        for (PaymentInput p : payments) {
            if (p.tendered() == null || p.tendered().signum() <= 0) {
                throw new IllegalArgumentException("Cada pago debe ser mayor que cero.");
            }
            paid = paid.add(money(p.tendered()));
            if (!p.affectsCash()) {
                nonCash = nonCash.add(money(p.tendered()));
            }
        }
        if (nonCash.compareTo(total) > 0) {
            throw new IllegalArgumentException(
                    "Los pagos con tarjeta o transferencia no pueden superar el total; el cambio solo se da en efectivo.");
        }
        if (paid.compareTo(total) < 0) {
            throw new IllegalArgumentException("Falta por pagar " + total.subtract(paid).toPlainString() + ".");
        }
        BigDecimal change = paid.subtract(total);
        BigDecimal remainingChange = change;
        List<BigDecimal> applied = new ArrayList<>(payments.size());
        for (int i = 0; i < payments.size(); i++) {
            applied.add(money(payments.get(i).tendered()));
        }
        // El cambio se descuenta de los pagos en efectivo, empezando por el último.
        for (int i = payments.size() - 1; i >= 0 && remainingChange.signum() > 0; i--) {
            if (payments.get(i).affectsCash()) {
                BigDecimal take = applied.get(i).min(remainingChange);
                applied.set(i, applied.get(i).subtract(take));
                remainingChange = remainingChange.subtract(take);
            }
        }
        BigDecimal cashNet = BigDecimal.ZERO;
        for (int i = 0; i < payments.size(); i++) {
            if (payments.get(i).affectsCash()) {
                cashNet = cashNet.add(applied.get(i));
            }
        }
        return new Settlement(List.copyOf(applied), paid, change, cashNet);
    }

    public static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    /** Al peso (HALF_UP), con escala 2 para guardarlo en las columnas de dinero. */
    public static BigDecimal pesos(BigDecimal value) {
        return value.setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
    }
}
