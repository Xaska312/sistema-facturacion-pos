package com.poshibrido.ai.application;

import com.poshibrido.ai.application.AskService.Turn;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Herramientas y conversación de "Pregúntale a tu negocio" (decisión 296). */
class AskToolsTest {

    private final AskTools tools = new AskTools(null, null, null, null, null, null, null, null, null, null, null,
            null, null);

    private static List<String> names(List<Map<String, Object>> definitions) {
        return definitions.stream().map(d -> String.valueOf(d.get("name"))).toList();
    }

    @Test
    void offersOnlyWhatThePersonCanSee() {
        assertThat(names(tools.definitions(Set.of("sales:read")))).containsExactly("sucursales", "ayuda_app",
                "mis_ventas_hoy");
        assertThat(names(tools.definitions(Set.of("reports:read", "inventory:read", "credit:read", "purchases:read",
                "cash:read", "sales:read", "expenses:read", "finance:read")))).hasSize(AskTools.TOOLS.size());
        // Decisión 325: gastos con expenses:read; estado de resultados, tablero y retenciones con finance:read.
        assertThat(names(tools.definitions(Set.of("expenses:read")))).containsExactly("sucursales", "ayuda_app", "gastos");
        assertThat(names(tools.definitions(Set.of("finance:read")))).containsExactly("sucursales", "ayuda_app",
                "estado_resultados", "tablero_finanzas", "retenciones");
        // Si la IA pide algo que la persona no puede ver, se niega sin consultar.
        AskTools.Outcome denied = tools.run("fiados", Map.of(), Set.of("sales:read"));
        assertThat(denied.error()).isTrue();
        assertThat(denied.content()).contains("no tiene permiso");
        assertThat(tools.run("borrar_todo", Map.of(), Set.of()).error()).isTrue();
        assertThat(AskTools.label("cuentas_por_pagar")).isEqualTo("Cuentas por pagar");
    }

    @Test
    void readsDatesStrictly() {
        assertThat(AskTools.date("2026-11-06")).hasDayOfMonth(6);
        assertThat(AskTools.date(" ")).isNull();
        assertThatThrownBy(() -> AskTools.date("ayer")).hasMessageContaining("AAAA-MM-DD");
    }

    @Test
    void conversationAlternatesStartsWithThePersonAndKeepsTheLastTurns() {
        List<Map<String, Object>> m = AskService.messages(List.of(
                new Turn("assistant", "suelto"), new Turn("user", "uno"), new Turn("assistant", "dos"),
                new Turn("user", "tres sin respuesta")), "nueva");
        assertThat(m).extracting(x -> x.get("content")).containsExactly("uno", "dos", "nueva");
        assertThat(m).extracting(x -> x.get("role")).containsExactly("user", "assistant", "user");
        assertThat(AskService.messages(null, "sola")).hasSize(1);
    }

    @Test
    void theAssistantTurnsCarryWhatTheyConsultedSoAskaDoesNotTakeThemBack() {
        // Decisión 355: sin esto Aska creía que las cifras anteriores eran inventadas.
        List<Map<String, Object>> m = AskService.messages(List.of(new Turn("user", "¿cómo voy?"),
                new Turn("assistant", "Vas bien: $1.000.", List.of("Resumen de ventas", "Estado de resultados"))),
                "¿y ayer?");
        assertThat(m.get(1).get("content")).isEqualTo("Vas bien: $1.000.\n[Consultó: Resumen de ventas · Estado de resultados]");
        assertThat(AskService.messages(List.of(new Turn("user", "hola"), new Turn("assistant", "Hola", null)), "x")
                .get(1).get("content")).isEqualTo("Hola");
    }

    @Test
    void theAnswerDoesNotRepeatWhatWasConsulted() {
        // Decisión 359: la IA copiaba la marca del historial en su respuesta.
        assertThat(AskService.clean("Vendes más el martes.\n\n[Consultó: Ventas por hora · Ventas por día]\n\nCIFRA: Día | martes"))
                .isEqualTo("Vendes más el martes.\n\nCIFRA: Día | martes");
        assertThat(AskService.clean("No hay. [Consultó: Producto] [Consultó: Categoría]")).isEqualTo("No hay.");
    }

    @Test
    void marginComparesWithoutTaxOnBothSides() {
        // Decisión 356 (y 348): la leche de $6.800 con IVA 19 % y costo $4.747,90 sin IVA deja 16,9 %, no 30 %.
        Map<String, Object> m = AskTools.margin(new java.math.BigDecimal("6800"), new java.math.BigDecimal("4747.90"),
                new java.math.BigDecimal("19"), true);
        assertThat(m.get("precioSinIva")).hasToString("5714.29");
        assertThat(m.get("margenPorcentaje")).hasToString("16.9");
        assertThat(m.get("sobreCostoPorcentaje")).hasToString("20.4");
        assertThat(AskTools.margin(new java.math.BigDecimal("1000"), java.math.BigDecimal.ZERO,
                java.math.BigDecimal.ZERO, true)).containsEntry("costoEnCero", true).containsEntry("sobreCostoPorcentaje", null);
    }
}
