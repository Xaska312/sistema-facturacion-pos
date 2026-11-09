package com.poshibrido.ai.application;

import com.poshibrido.ai.application.AskaRecapService.Recap;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** "Lo que hiciste con Aska" (decisión 309): el tiempo ahorrado y cómo se cuenta. */
class AskaRecapServiceTest {

    @Test
    void theTimeSavedFollowsTheAssumptions() {
        // 120 líneas × 30 s = 60 min; 30 productos = 30 min; 6 preguntas = 30 min; 1 pedido = 10; 30 resúmenes = 300.
        assertThat(AskaRecapService.minutesSaved(120, 30, 6, 1, 30)).isEqualTo(430);
        assertThat(AskaRecapService.savedLabel(430)).isEqualTo("cerca de 7 horas");
        assertThat(AskaRecapService.savedLabel(100)).isEqualTo("cerca de 1,5 horas");
        assertThat(AskaRecapService.savedLabel(60)).isEqualTo("cerca de 1 hora");
        assertThat(AskaRecapService.savedLabel(45)).isEqualTo("cerca de 45 minutos");
        assertThat(AskaRecapService.savedLabel(1)).isEqualTo("un par de minutos");
    }

    @Test
    void onlyWhatHappenedIsTold() {
        LocalDate d = LocalDate.of(2026, 10, 1);
        Recap r = new Recap("Tu octubre con Aska", d, d.plusDays(30), 1, 18, 0, 3, 0, 0, 24, "cerca de 24 minutos");
        assertThat(AskaRecapService.lines(r)).extracting(l -> l[1]).containsExactly(
                "Leí 1 factura de tus proveedores: 18 líneas que no digitaste.",
                "Respondí 3 preguntas sobre tu negocio.");
        assertThat(r.empty()).isFalse();
        assertThat(new Recap("x", d, d, 0, 0, 0, 0, 0, 0, 0, "").empty()).isTrue();
    }
}
