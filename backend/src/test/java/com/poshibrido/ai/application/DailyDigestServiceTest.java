package com.poshibrido.ai.application;

import com.poshibrido.ai.application.DailyDigestService.Digest;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Resumen del día (decisión 299): qué día resume y qué ve cada rol. */
class DailyDigestServiceTest {

    private static final String CONTENT = """
            {"points":[{"section":"SALES","tone":"good","title":"Ventas","detail":"Bien"},
             {"section":"CASH","tone":"bad","title":"Caja","detail":"Faltan $2.000"},
             {"section":"MONEY","tone":"bogus","title":"Mal tono","detail":"x"}],
             "figures":[{"label":"Ventas","value":"$1"}]}""";

    @Test
    void beforeNoonItSummarizesYesterday() {
        LocalDate today = LocalDate.of(2026, 11, 7);
        assertThat(DailyDigestService.digestDate(LocalTime.of(21, 0), today)).isEqualTo(today);
        assertThat(DailyDigestService.digestDate(LocalTime.of(6, 30), today)).isEqualTo(today.minusDays(1));
    }

    @Test
    void eachRoleSeesOnlyItsSections() {
        Digest full = DailyDigestService.read(LocalDate.of(2026, 11, 7), "Buen día", CONTENT, null);
        assertThat(full.points()).hasSize(2);
        Digest owner = DailyDigestService.visible(full, Set.of("reports:read", "cash:read"));
        assertThat(owner.points()).hasSize(2);
        assertThat(owner.figures()).hasSize(1);
        Digest cashier = DailyDigestService.visible(full, Set.of("cash:read", "sales:read"));
        assertThat(cashier.points()).extracting(DailyDigestService.Point::section).containsExactly("CASH");
        assertThat(cashier.figures()).isEmpty();
        assertThat(cashier.headline()).doesNotContain("Buen día");
        assertThat(DailyDigestService.visible(full, Set.of("sales:read"))).isNull();
        assertThat(DailyDigestService.read(LocalDate.now(), " ", CONTENT, null)).isNull();
    }
}
