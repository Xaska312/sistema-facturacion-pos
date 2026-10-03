package com.poshibrido.inventory.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class WeightedAverageTest {

    @Test
    void mixesCurrentStockWithEntry() {
        // 24 a 1.000 + 12 a 2.000 = 36 a 1.333,33
        assertThat(StockLedger.weightedAverage(new BigDecimal("24"), new BigDecimal("1000"), new BigDecimal("12"),
                new BigDecimal("2000"))).isEqualByComparingTo("1333.33");
    }

    @Test
    void withoutStockTakesEntryCost() {
        assertThat(StockLedger.weightedAverage(BigDecimal.ZERO, new BigDecimal("500"), BigDecimal.TEN,
                new BigDecimal("750"))).isEqualByComparingTo("750");
        assertThat(StockLedger.weightedAverage(new BigDecimal("-3"), new BigDecimal("500"), BigDecimal.TEN,
                new BigDecimal("750"))).isEqualByComparingTo("750");
    }
}
