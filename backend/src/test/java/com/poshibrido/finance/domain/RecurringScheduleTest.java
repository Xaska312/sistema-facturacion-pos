package com.poshibrido.finance.domain;

import com.poshibrido.finance.domain.RecurringSchedule.Frequency;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecurringScheduleTest {

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    @Test
    void monthlyUsesTheLastDayInShortMonths() {
        RecurringSchedule rent = new RecurringSchedule(Frequency.MONTHLY, 31, d("2026-01-01"));
        assertThat(rent.between(d("2026-01-01"), d("2026-05-31")))
                .containsExactly(d("2026-01-31"), d("2026-02-28"), d("2026-03-31"), d("2026-04-30"), d("2026-05-31"));
        assertThat(rent.isDue(d("2026-02-28"))).isTrue();
        assertThat(rent.isDue(d("2026-03-28"))).isFalse();
        // 2028 es bisiesto.
        assertThat(rent.between(d("2028-02-01"), d("2028-02-29"))).containsExactly(d("2028-02-29"));
    }

    @Test
    void biweeklyIsThe15thAndTheLastDay() {
        RecurringSchedule payroll = new RecurringSchedule(Frequency.BIWEEKLY, 10, d("2026-02-01"));
        assertThat(payroll.dayOfMonth()).isNull();
        assertThat(payroll.between(d("2026-02-01"), d("2026-03-20")))
                .containsExactly(d("2026-02-15"), d("2026-02-28"), d("2026-03-15"));
        assertThat(payroll.nextFrom(d("2026-02-16"))).isEqualTo(d("2026-02-28"));
        assertThat(payroll.nextFrom(d("2026-03-01"))).isEqualTo(d("2026-03-15"));
    }

    @Test
    void neverBeforeTheStart() {
        RecurringSchedule internet = new RecurringSchedule(Frequency.MONTHLY, 5, d("2026-03-10"));
        assertThat(internet.between(d("2026-01-01"), d("2026-04-30"))).containsExactly(d("2026-04-05"));
        assertThat(internet.isDue(d("2026-03-05"))).isFalse();
        assertThat(internet.nextFrom(d("2026-01-01"))).isEqualTo(d("2026-04-05"));
        assertThat(internet.between(d("2026-05-01"), d("2026-04-30"))).isEmpty();
        // Si empieza justo el día de pago, esa fecha cuenta.
        assertThat(new RecurringSchedule(Frequency.MONTHLY, 10, d("2026-03-10")).isDue(d("2026-03-10"))).isTrue();
    }

    @Test
    void rejectsAnInvalidDay() {
        assertThatThrownBy(() -> new RecurringSchedule(Frequency.MONTHLY, 0, d("2026-01-01")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecurringSchedule(Frequency.MONTHLY, null, d("2026-01-01")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
