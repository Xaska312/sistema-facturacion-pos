package com.poshibrido.dining.application;

import com.poshibrido.sales.domain.SaleCalculator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Fase 12b-5: reparto de propinas en partes iguales y propina dentro de los pagos. */
class TipSharesTest {

    @Test
    void splitsInWholePesosAndTheExtraGoesToTheFirst() {
        assertThat(TipShares.split(new BigDecimal("100000"), 3))
                .containsExactly(new BigDecimal("33334.00"), new BigDecimal("33333.00"), new BigDecimal("33333.00"));
        assertThat(TipShares.split(new BigDecimal("50000.00"), 2))
                .containsExactly(new BigDecimal("25000.00"), new BigDecimal("25000.00"));
        assertThatThrownBy(() -> TipShares.split(BigDecimal.TEN, 0)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void theTipComesOutOfTheLastPaymentWithItsMethod() {
        List<BigDecimal> applied = List.of(new BigDecimal("30000"), new BigDecimal("25000"));
        assertThat(SaleCalculator.carveTip(applied, List.of(true, false), new BigDecimal("5000")))
                .contains(List.of(new BigDecimal("25000"), new BigDecimal("25000")));
        // Ningún pago de ese medio alcanza.
        assertThat(SaleCalculator.carveTip(applied, List.of(false, true), new BigDecimal("30000"))).isEmpty();
    }
}
