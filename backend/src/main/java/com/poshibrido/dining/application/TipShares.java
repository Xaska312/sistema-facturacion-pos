package com.poshibrido.dining.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/** Reparto de propinas en partes iguales y en pesos enteros (Fase 12b-5): los pesos que sobran van a los primeros. */
final class TipShares {

    private TipShares() {
    }

    static List<BigDecimal> split(BigDecimal amount, int people) {
        if (people <= 0) {
            throw new IllegalArgumentException("Se reparte entre al menos una persona.");
        }
        BigDecimal pesos = amount.setScale(0, RoundingMode.DOWN);
        BigDecimal each = pesos.divide(BigDecimal.valueOf(people), 0, RoundingMode.DOWN);
        int extra = pesos.subtract(each.multiply(BigDecimal.valueOf(people))).intValueExact();
        List<BigDecimal> shares = new ArrayList<>(people);
        for (int i = 0; i < people; i++) {
            shares.add((i < extra ? each.add(BigDecimal.ONE) : each).setScale(2, RoundingMode.UNNECESSARY));
        }
        return shares;
    }
}
