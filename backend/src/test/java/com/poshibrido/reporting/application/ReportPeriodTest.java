package com.poshibrido.reporting.application;

import com.poshibrido.shared.error.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReportPeriodTest {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 5);

    @Test
    void coversWholeLocalDays() {
        ReportPeriod p = ReportPeriod.of(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 5), BOGOTA, TODAY);
        assertThat(p.start()).isEqualTo(Instant.parse("2026-10-01T05:00:00Z"));
        assertThat(p.end()).isEqualTo(Instant.parse("2026-10-06T05:00:00Z"));
        assertThat(p.label()).isEqualTo("2026-10-01_2026-10-05");
    }

    @Test
    void missingDatesMeanToday() {
        ReportPeriod p = ReportPeriod.of(null, null, BOGOTA, TODAY);
        assertThat(p.from()).isEqualTo(TODAY);
        assertThat(p.to()).isEqualTo(TODAY);
        assertThat(p.label()).isEqualTo("2026-10-05");
        assertThat(ReportPeriod.of(LocalDate.of(2026, 9, 1), null, BOGOTA, TODAY).to()).isEqualTo(LocalDate.of(2026, 9, 1));
    }

    @Test
    void rejectsInvertedOrTooLongRanges() {
        assertThatThrownBy(() -> ReportPeriod.of(TODAY, TODAY.minusDays(1), BOGOTA, TODAY))
                .isInstanceOf(BusinessRuleException.class);
        assertThatThrownBy(() -> ReportPeriod.of(TODAY.minusDays(ReportPeriod.MAX_DAYS), TODAY, BOGOTA, TODAY))
                .isInstanceOf(BusinessRuleException.class);
        assertThat(ReportPeriod.of(TODAY.minusDays(ReportPeriod.MAX_DAYS - 1), TODAY, BOGOTA, TODAY)).isNotNull();
    }

    @Test
    void averagesAndMargins() {
        assertThat(ReportQueryService.average(new BigDecimal("31500"), 5)).isEqualByComparingTo("6300");
        assertThat(ReportQueryService.average(BigDecimal.ZERO, 0)).isEqualByComparingTo("0");
        assertThat(ReportQueryService.margin(new BigDecimal("18647.05"), new BigDecimal("27647.05")))
                .isEqualByComparingTo("67.45");
        assertThat(ReportQueryService.margin(BigDecimal.ONE, BigDecimal.ZERO)).isEqualByComparingTo("0");
    }
}
