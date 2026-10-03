package com.poshibrido.cash.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;

/** Reglas del arqueo de caja. */
public final class CashCount {

    private CashCount() {
    }

    /** Esperado = base de apertura + suma de los movimientos de efectivo (con signo). */
    public static BigDecimal expected(BigDecimal openingAmount, Collection<BigDecimal> movementAmounts) {
        BigDecimal total = openingAmount;
        for (BigDecimal amount : movementAmounts) {
            total = total.add(amount);
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    /** Diferencia del arqueo: positiva = sobrante, negativa = faltante. */
    public static BigDecimal difference(BigDecimal counted, BigDecimal expected) {
        return counted.setScale(2, RoundingMode.HALF_UP).subtract(expected.setScale(2, RoundingMode.HALF_UP));
    }
}
