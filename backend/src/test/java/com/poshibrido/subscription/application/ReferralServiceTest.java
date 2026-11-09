package com.poshibrido.subscription.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** Referidos (decisión 312): códigos legibles y la comisión del aliado. */
class ReferralServiceTest {

    @Test
    void codesAreReadableAndCommissionIsTwentyPercent() {
        assertThat(ReferralService.newCode("Minimercado La Esquiña")).matches("MINIME-[A-Z2-9]{3}");
        assertThat(ReferralService.newCode("Él")).matches("XASKA-[A-Z2-9]{3}");
        assertThat(ReferralService.normalize(" esquin-7kq ")).isEqualTo("ESQUIN-7KQ");
        assertThat(ReferralService.commission(new BigDecimal("59900"))).isEqualByComparingTo("11980");
        assertThat(ReferralService.commission(new BigDecimal("45000.50"))).isEqualByComparingTo("9000");
    }
}
