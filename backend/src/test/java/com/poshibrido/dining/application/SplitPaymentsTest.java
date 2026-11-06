package com.poshibrido.dining.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Reparto proporcional del pago entre las ventas de cada caja (decisión 294). */
class SplitPaymentsTest {

    private static List<BigDecimal> money(String... values) {
        return java.util.Arrays.stream(values).map(BigDecimal::new).toList();
    }

    @Test
    void eachMethodIsSplitInProportion() {
        // Tarjeta 15.000 y efectivo 25.000 entre una venta de 18.000 y otra de 22.000.
        List<List<BigDecimal>> x = SplitPayments.allocate(money("15000", "25000"), money("18000", "22000"));
        assertThat(x.get(0)).containsExactly(new BigDecimal("6750.00"), new BigDecimal("11250.00"));
        assertThat(x.get(1)).containsExactly(new BigDecimal("8250.00"), new BigDecimal("13750.00"));
    }

    @Test
    void roundingNeverLosesAPesoNorGoesNegative() {
        List<BigDecimal> applied = money("100.01", "33.33", "0.01");
        List<BigDecimal> dues = money("44.45", "44.45", "44.45");
        List<List<BigDecimal>> x = SplitPayments.allocate(applied, dues);
        for (int g = 0; g < dues.size(); g++) {
            assertThat(x.get(g).stream().reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo(dues.get(g));
            assertThat(x.get(g)).allSatisfy(v -> assertThat(v.signum()).isGreaterThanOrEqualTo(0));
        }
        for (int j = 0; j < applied.size(); j++) {
            int col = j;
            assertThat(x.stream().map(r -> r.get(col)).reduce(BigDecimal.ZERO, BigDecimal::add))
                    .isEqualByComparingTo(applied.get(j));
        }
    }

    @Test
    void aSingleMethodGoesWhole() {
        List<List<BigDecimal>> x = SplitPayments.allocate(money("40000"), money("18000", "22000"));
        assertThat(x.get(0)).containsExactly(new BigDecimal("18000.00"));
        assertThat(x.get(1)).containsExactly(new BigDecimal("22000.00"));
    }

    @Test
    void totalsMustMatch() {
        assertThatThrownBy(() -> SplitPayments.allocate(money("10"), money("11")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(SplitPayments.allocate(money("0"), money("0", "0")).get(1)).containsExactly(new BigDecimal("0.00"));
    }
}
