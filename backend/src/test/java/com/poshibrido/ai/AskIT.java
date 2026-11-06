package com.poshibrido.ai;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.ai.application.AnthropicMessages.AiUnavailableException;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * "Pregúntale a tu negocio" (decisión 296): solo con XASKA IA; la IA (aquí simulada) pide una consulta de solo lectura,
 * XASKA la hace con los permisos de quien pregunta y le devuelve el resultado; solo cuentan las preguntas respondidas
 * y el tope del mes sale de la consola.
 */
class AskIT extends IntegrationTest {

    @MockitoBean
    private AnthropicMessages ai;

    private static Map<String, Object> usage() {
        return Map.of("input_tokens", 900, "output_tokens", 60);
    }

    @Test
    @SuppressWarnings("unchecked")
    void answersWithReadOnlyQueriesAndCountsOnlyAnsweredQuestions() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("pregunta-ia");
        Session s = owner.tenant();
        String ask = """
                {"question":"¿Cuánto vendí hoy?","history":[{"role":"user","text":"Hola"},
                 {"role":"assistant","text":"Hola, ¿qué quieres saber?"}]}""";

        // Sin XASKA IA no hay permiso.
        api.postWith(s, "/api/v1/ai/ask", ask).andExpect(status().isForbidden());
        Session admin = platformAdmin();
        String extras = "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId());
        api.putWith(admin, extras, "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}")
                .andExpect(status().isOk());
        s = renew(s);
        api.getWith(s, "/api/v1/ai/usage").andExpect(jsonPath("$.limit").value(300))
                .andExpect(jsonPath("$.used").value(0));

        // La IA pide el resumen de ventas, XASKA lo consulta y la IA responde.
        doReturn(Map.of("stop_reason", "tool_use", "usage", usage(), "content", List.of(
                        Map.of("type", "text", "text", "Voy a revisar."),
                        Map.of("type", "tool_use", "id", "t1", "name", "resumen_ventas", "input", Map.of()))),
                Map.of("stop_reason", "end_turn", "usage", usage(), "content", List.of(
                        Map.of("type", "text", "text", "Hoy no has vendido: $0."))))
                .when(ai).send(any());
        api.postWith(s, "/api/v1/ai/ask", ask).andExpect(status().isOk())
                .andExpect(jsonPath("$.answer").value("Hoy no has vendido: $0."))
                .andExpect(jsonPath("$.consulted[0]").value("Resumen de ventas"))
                .andExpect(jsonPath("$.usage.used").value(1));
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai, atLeastOnce()).send(sent.capture());
        Map<String, Object> first = sent.getAllValues().getFirst();
        assertThat(String.valueOf(first.get("tools"))).contains("resumen_ventas").contains("fiados");
        assertThat(String.valueOf(first.get("system"))).contains("Nunca inventes cifras");
        List<Map<String, Object>> firstMessages = (List<Map<String, Object>>) first.get("messages");
        // Historial (texto) y la pregunta; luego lo que pidió la IA y el resultado de la consulta.
        assertThat(firstMessages.get(2).get("content")).isEqualTo("¿Cuánto vendí hoy?");
        assertThat(firstMessages.get(1).get("role")).isEqualTo("assistant");
        Map<String, Object> second = sent.getAllValues().get(1);
        List<Map<String, Object>> messages = (List<Map<String, Object>>) second.get("messages");
        assertThat(String.valueOf(messages.getLast())).contains("tool_result").contains("salesCount");

        // Sin respuesta o rechazada: no cuenta.
        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doThrow(new AiUnavailableException("sin red", null)).when(ai).send(any());
        api.postWith(s, "/api/v1/ai/ask", ask).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("no respondió")));
        doReturn(Map.of("stop_reason", "refusal", "usage", usage(), "content", List.of())).when(ai).send(any());
        api.postWith(s, "/api/v1/ai/ask", ask).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("No se descontó")));
        api.getWith(s, "/api/v1/ai/usage").andExpect(jsonPath("$.used").value(1));

        // Tope de la consola lleno.
        try {
            api.putWith(admin, "/api/v1/platform/ai-allowances/QUESTIONS", "{\"monthlyLimit\":1}")
                    .andExpect(status().isOk());
            api.postWith(s, "/api/v1/ai/ask", ask).andExpect(status().is(422))
                    .andExpect(jsonPath("$.detail", containsString("Llegaste a las 1 preguntas")));
        } finally {
            api.putWith(admin, "/api/v1/platform/ai-allowances/QUESTIONS", "{\"monthlyLimit\":300}")
                    .andExpect(status().isOk());
        }
        api.postWith(s, "/api/v1/ai/ask", "{\"question\":\"  \"}").andExpect(status().isBadRequest());
    }

    private Session renew(Session session) throws Exception {
        return TestApi.session(api.refreshRaw(session.refreshToken()).andExpect(status().isOk()).andReturn());
    }
}
