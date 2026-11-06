package com.poshibrido.dining.application;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Reparto del pago de una cuenta entre las ventas de cada caja (decisión 294): cada medio de pago se reparte en
 * proporción a lo que debe cada venta (si la margarita es el 40 % de la cuenta, esa venta lleva el 40 % del efectivo y
 * el 40 % de la tarjeta), al centavo y sin que nada quede negativo: cada venta suma exactamente lo suyo y cada medio de
 * pago suma exactamente lo que se pagó con él.
 */
final class SplitPayments {

    private SplitPayments() {
    }

    /**
     * @param applied lo aplicado de cada pago (sin el cambio ni la propina), en orden
     * @param dues    lo que debe cada venta, en orden; debe sumar lo mismo que {@code applied}
     * @return por cada venta, cuánto le toca de cada pago
     */
    static List<List<BigDecimal>> allocate(List<BigDecimal> applied, List<BigDecimal> dues) {
        int methods = applied.size();
        int groups = dues.size();
        long[] a = cents(applied);
        long[] d = cents(dues);
        long total = sum(a);
        if (total != sum(d)) {
            throw new IllegalArgumentException("Los pagos no suman lo que deben las ventas.");
        }
        long[][] x = new long[groups][methods];
        if (total > 0) {
            BigInteger t = BigInteger.valueOf(total);
            for (int g = 0; g < groups; g++) {
                for (int j = 0; j < methods; j++) {
                    x[g][j] = BigInteger.valueOf(a[j]).multiply(BigInteger.valueOf(d[g])).divide(t).longValueExact();
                }
            }
            // Lo que falta por los redondeos hacia abajo: se completa en orden (nunca deja nada negativo).
            long[] rowLeft = new long[groups];
            long[] colLeft = new long[methods];
            for (int g = 0; g < groups; g++) {
                rowLeft[g] = d[g] - sum(x[g]);
            }
            for (int j = 0; j < methods; j++) {
                long used = 0;
                for (int g = 0; g < groups; g++) {
                    used += x[g][j];
                }
                colLeft[j] = a[j] - used;
            }
            for (int g = 0; g < groups; g++) {
                for (int j = 0; j < methods && rowLeft[g] > 0; j++) {
                    long take = Math.min(rowLeft[g], colLeft[j]);
                    x[g][j] += take;
                    rowLeft[g] -= take;
                    colLeft[j] -= take;
                }
            }
        }
        List<List<BigDecimal>> result = new ArrayList<>(groups);
        for (int g = 0; g < groups; g++) {
            List<BigDecimal> row = new ArrayList<>(methods);
            for (int j = 0; j < methods; j++) {
                row.add(BigDecimal.valueOf(x[g][j], 2));
            }
            result.add(List.copyOf(row));
        }
        return List.copyOf(result);
    }

    private static long[] cents(List<BigDecimal> values) {
        long[] result = new long[values.size()];
        for (int i = 0; i < result.length; i++) {
            BigDecimal v = values.get(i).setScale(2, RoundingMode.HALF_UP);
            if (v.signum() < 0) {
                throw new IllegalArgumentException("Montos negativos.");
            }
            result[i] = v.movePointRight(2).longValueExact();
        }
        return result;
    }

    private static long sum(long[] values) {
        long total = 0;
        for (long v : values) {
            total += v;
        }
        return total;
    }
}
