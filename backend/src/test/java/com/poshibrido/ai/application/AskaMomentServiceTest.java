package com.poshibrido.ai.application;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Aska en el momento del dolor (decisión 308): cuándo un inventario cuenta como vacío. */
class AskaMomentServiceTest {

    @Test
    void anInventoryIsEmptyWhenAlmostNothingHasStock() {
        assertThat(AskaMomentService.isEmpty(4, 0)).as("pocos productos: está empezando").isFalse();
        assertThat(AskaMomentService.isEmpty(5, 0)).isTrue();
        assertThat(AskaMomentService.isEmpty(50, 10)).as("1 de cada 5").isTrue();
        assertThat(AskaMomentService.isEmpty(50, 11)).isFalse();
        assertThat(AskaMomentService.isEmpty(50, 50)).isFalse();
    }
}
