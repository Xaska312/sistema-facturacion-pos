package com.poshibrido.purchasing.application;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** Fórmula del pedido sugerido (decisión 297). */
class PurchaseSuggestionServiceTest {

    private static BigDecimal d(String v) {
        return new BigDecimal(v);
    }

    @Test
    void recentWeekWeighsMoreThanTheMonth() {
        // 14 en la semana y 14 en el mes: 0,6 × 2 + 0,4 × 0,4667 = 1,387.
        assertThat(PurchaseSuggestionService.dailyAverage(d("14"), d("14"))).isEqualByComparingTo("1.387");
        assertThat(PurchaseSuggestionService.dailyAverage(d("0"), d("30"))).isEqualByComparingTo("0.400");
    }

    @Test
    void suggestedCoversTheDaysPlusMinimumWithoutPassingTheMaximum() {
        assertThat(PurchaseSuggestionService.suggested(d("2"), 15, d("10"), d("5"), null)).isEqualByComparingTo("25");
        // El máximo limita: 2 × 15 + 5 − 10 = 25, pero solo caben 20 − 10 = 10.
        assertThat(PurchaseSuggestionService.suggested(d("2"), 15, d("10"), d("5"), d("20"))).isEqualByComparingTo("10");
        // Hacia arriba y nunca negativo.
        assertThat(PurchaseSuggestionService.suggested(d("0.1"), 15, d("0"), null, null)).isEqualByComparingTo("2");
        assertThat(PurchaseSuggestionService.suggested(d("1"), 7, d("50"), d("5"), null)).isEqualByComparingTo("0");
        // Lo vencido no cuenta como existencia útil (la existencia útil ya llega descontada).
        assertThat(PurchaseSuggestionService.suggested(d("0"), 15, d("2"), d("5"), null)).isEqualByComparingTo("3");
    }
}
