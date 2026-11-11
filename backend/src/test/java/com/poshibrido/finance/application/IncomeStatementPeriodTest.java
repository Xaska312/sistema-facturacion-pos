package com.poshibrido.finance.application;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class IncomeStatementPeriodTest {

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void aMonthComparesWithTheSameDaysOfThePreviousMonth() {
        assertThat(IncomeStatementService.previous(d("2026-11-01"), d("2026-11-30")))
                .containsExactly(d("2026-10-01"), d("2026-10-31"));
        // Mes en curso hasta el 11: del 1 al 11 del mes anterior.
        assertThat(IncomeStatementService.previous(d("2026-11-01"), d("2026-11-11")))
                .containsExactly(d("2026-10-01"), d("2026-10-11"));
        // Marzo completo frente a febrero completo; el 30 de marzo frente al último de febrero.
        assertThat(IncomeStatementService.previous(d("2026-03-01"), d("2026-03-31")))
                .containsExactly(d("2026-02-01"), d("2026-02-28"));
        assertThat(IncomeStatementService.previous(d("2026-03-01"), d("2026-03-30")))
                .containsExactly(d("2026-02-01"), d("2026-02-28"));
    }

    @Test
    void aRangeComparesWithTheDaysJustBefore() {
        assertThat(IncomeStatementService.previous(d("2026-11-05"), d("2026-11-11")))
                .containsExactly(d("2026-10-29"), d("2026-11-04"));
    }
}
