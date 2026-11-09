package com.poshibrido.ai.application;

import com.poshibrido.ai.application.DailyDigestService.Digest;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.time.LocalTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Resumen del día (decisiones 299 y 307): qué día resume, qué ve cada rol y el clima del día. */
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

    @Test
    void theWeatherFollowsTheDay() {
        var good = new DailyDigestService.Point("SALES", "good", "Ventas", "Bien");
        var warn = new DailyDigestService.Point("INVENTORY", "warning", "Arroz", "Bajo");
        var bad = new DailyDigestService.Point("CASH", "bad", "Caja", "Faltan");
        BigDecimal week = new BigDecimal("100000");
        assertThat(DigestWeather.overall(new BigDecimal("120000"), week, List.of(good))).isEqualTo(DigestWeather.SUNNY);
        assertThat(DigestWeather.overall(new BigDecimal("120000"), week, List.of(warn))).isEqualTo(DigestWeather.PARTLY);
        assertThat(DigestWeather.overall(new BigDecimal("80000"), week, List.of(good))).isEqualTo(DigestWeather.CLOUDY);
        assertThat(DigestWeather.overall(new BigDecimal("40000"), week, List.of(good))).isEqualTo(DigestWeather.RAIN);
        assertThat(DigestWeather.overall(new BigDecimal("200000"), week, List.of(bad))).isEqualTo(DigestWeather.STORM);
        assertThat(DigestWeather.overall(BigDecimal.ZERO, BigDecimal.ZERO, List.of())).isEqualTo(DigestWeather.QUIET);
        assertThat(DigestWeather.overall(new BigDecimal("5000"), BigDecimal.ZERO, List.of())).isEqualTo(DigestWeather.SUNNY);
        assertThat(DigestWeather.section("CASH", List.of(bad, warn))).isEqualTo(DigestWeather.STORM);
        assertThat(DigestWeather.section("INVENTORY", List.of(bad, warn))).isEqualTo(DigestWeather.PARTLY);
        assertThat(DigestWeather.section("MONEY", List.of(bad, warn))).isEqualTo(DigestWeather.SUNNY);
    }

    @Test
    void theForecastAndQuestionsAreOnlyForWhoSeesSales() {
        String content = CONTENT.replace("\"figures\"", "\"weather\":\"RAIN\",\"forecast\":\"Mañana sube\","
                + "\"followUps\":[\"¿Por qué bajó?\",\"¿Qué pido?\",\"Una tercera\"],\"figures\"");
        Digest full = DailyDigestService.read(LocalDate.of(2026, 11, 7), "Día flojo", content, null);
        assertThat(full.weather()).isEqualTo("RAIN");
        assertThat(full.followUps()).containsExactly("¿Por qué bajó?", "¿Qué pido?");
        Digest owner = DailyDigestService.visible(full, Set.of("reports:read"));
        assertThat(owner.forecast()).isEqualTo("Mañana sube");
        Digest cashier = DailyDigestService.visible(full, Set.of("cash:read"));
        assertThat(cashier.weather()).isNull();
        assertThat(cashier.forecast()).isNull();
    }
}
