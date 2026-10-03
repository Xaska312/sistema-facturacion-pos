package com.poshibrido.cash.domain;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CashCountTest {

    @Test
    void expectedIsOpeningPlusSignedMovements() {
        BigDecimal expected = CashCount.expected(new BigDecimal("100000"), List.of(
                new BigDecimal("4000"), new BigDecimal("20000"), new BigDecimal("-5000"), new BigDecimal("-50000"),
                new BigDecimal("-4000")));
        assertThat(expected).isEqualByComparingTo("65000");
    }

    @Test
    void differenceIsCountedMinusExpected() {
        assertThat(CashCount.difference(new BigDecimal("64000"), new BigDecimal("65000"))).isEqualByComparingTo("-1000");
        assertThat(CashCount.difference(new BigDecimal("65500"), new BigDecimal("65000"))).isEqualByComparingTo("500");
        assertThat(CashCount.difference(new BigDecimal("65000"), new BigDecimal("65000"))).isEqualByComparingTo("0");
    }

    @Test
    void closingStoresTheCount() {
        CashSession session = CashSession.open(java.util.UUID.randomUUID(), java.util.UUID.randomUUID(),
                java.util.UUID.randomUUID(), new BigDecimal("50000"), null);
        session.close(new BigDecimal("49000"), new BigDecimal("50000"), java.util.UUID.randomUUID(), "Faltó");
        assertThat(session.isOpen()).isFalse();
        assertThat(session.getDifference()).isEqualByComparingTo("-1000");
    }
}
