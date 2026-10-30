package com.poshibrido.dining;

import com.poshibrido.dining.application.TabLabels;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** Nombre corto de las cuentas (Fase 12b-2). */
class TabLabelsTest {

    @Test
    void namesTablesTakeawayAndDelivery() {
        assertThat(TabLabels.label("TABLE", 7, "4", null)).isEqualTo("Mesa 4");
        assertThat(TabLabels.label("TABLE", 7, "Barra 2", null)).isEqualTo("Barra 2");
        assertThat(TabLabels.label("TAKEAWAY", 12, null, "  Juan ")).isEqualTo("Para llevar · Juan");
        assertThat(TabLabels.label("TAKEAWAY", 12, null, null)).isEqualTo("Para llevar · #12");
        assertThat(TabLabels.label("DELIVERY", 13, null, "Ana")).isEqualTo("Domicilio · Ana");
    }
}
