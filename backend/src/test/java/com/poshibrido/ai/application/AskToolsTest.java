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

    private final AskTools tools = new AskTools(null, null, null, null, null, null, null);

    private static List<String> names(List<Map<String, Object>> definitions) {
        return definitions.stream().map(d -> String.valueOf(d.get("name"))).toList();
    }

    @Test
    void offersOnlyWhatThePersonCanSee() {
        assertThat(names(tools.definitions(Set.of("sales:read")))).containsExactly("sucursales", "mis_ventas_hoy");
        assertThat(names(tools.definitions(Set.of("reports:read", "inventory:read", "credit:read", "purchases:read",
                "cash:read", "sales:read")))).hasSize(AskTools.TOOLS.size());
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
}
