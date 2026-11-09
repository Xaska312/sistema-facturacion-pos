package com.poshibrido.ai;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.ai.application.AnthropicMessages.AiUnavailableException;
import com.poshibrido.mail.MailMessage;
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
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Resumen del día de Aska (decisión 299): solo con XASKA IA; ajustes de hora y destinatarios; la IA (simulada) recibe
 * los datos del día y su resumen se guarda para Inicio y llega por correo; si la IA no responde, no queda nada.
 */
class DailyDigestIT extends IntegrationTest {

    @MockitoBean
    private AnthropicMessages ai;

    private static final String DIGEST = """
            {"headline":"Buen día: vendiste más que ayer.","points":[
             {"section":"SALES","tone":"good","title":"Ventas arriba","detail":"$0 frente a $0 ayer."},
             {"section":"CASH","tone":"bad","title":"Caja descuadrada","detail":"Faltan $2.000 en Caja 1."},
             {"section":"INVENTORY","tone":"warning","title":"Arroz bajo el mínimo","detail":"Quedan 3."},
             {"section":"MONEY","tone":"info","title":"Proveedores","detail":"Nada vence esta semana."},
             {"section":"OTRA","tone":"info","title":"Ignorar","detail":"x"}],
             "figures":[{"label":"Ventas","value":"$0"},{"label":"Ticket","value":"$0"}],
             "forecast":"Los martes suelen ser flojos; ten listo el arroz.",
             "followUps":["¿Qué pasó con la caja?","¿Qué debo pedir mañana?","Sobra"]}""";

    @Test
    @SuppressWarnings("unchecked")
    void buildsSavesAndMailsTheDigestOnlyWithXaskaIa() throws Exception {
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        Owned owner = api.newTenant("resumen-dia");
        Session s = owner.tenant();
        api.getWith(s, "/api/v1/ai/digest/settings").andExpect(status().isForbidden());
        Session admin = platformAdmin();
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId()),
                "{\"modules\":[],\"features\":[\"AI\"],\"branches\":0,\"registers\":0,\"users\":0}").andExpect(status().isOk());
        s = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());

        api.getWith(s, "/api/v1/ai/digest/settings").andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.sendTime").value("21:00")).andExpect(jsonPath("$.limit").value(31));
        api.putWith(s, "/api/v1/ai/digest/settings", "{\"enabled\":true,\"sendTime\":\"6 pm\",\"recipients\":[]}")
                .andExpect(status().is(422));
        api.putWith(s, "/api/v1/ai/digest/settings", "{\"enabled\":true,\"sendTime\":\"06:30\",\"recipients\":[]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.sendTime").value("06:30"));
        api.getWith(s, "/api/v1/ai/digest/latest").andExpect(status().isNoContent());

        // Si la IA no responde, no queda nada y no cuenta.
        doThrow(new AiUnavailableException("sin red", null)).when(ai).send(any());
        api.postWith(s, "/api/v1/ai/digest/run", "").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("No se descontó")));

        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doReturn(Map.of("stop_reason", "end_turn", "usage", Map.of("input_tokens", 2000, "output_tokens", 300),
                "content", List.of(Map.of("type", "text", "text", DIGEST)))).when(ai).send(any());
        api.postWith(s, "/api/v1/ai/digest/run", "").andExpect(status().isOk())
                .andExpect(jsonPath("$.headline").value("Buen día: vendiste más que ayer."))
                .andExpect(jsonPath("$.points.length()").value(4))
                .andExpect(jsonPath("$.figures[0].label").value("Ventas"))
                .andExpect(jsonPath("$.weather").value("STORM"))
                .andExpect(jsonPath("$.forecast").value("Los martes suelen ser flojos; ten listo el arroz."))
                .andExpect(jsonPath("$.followUps.length()").value(2));
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(ai).send(sent.capture());
        assertThat(String.valueOf(sent.getValue().get("messages"))).contains("mismoDiaSemanaPasada").contains("caja")
                .contains("inventario").contains("proveedores")
                .contains("pronosticoManana");
        assertThat(String.valueOf(sent.getValue().get("output_config"))).contains("json_schema");

        api.getWith(s, "/api/v1/ai/digest/latest").andExpect(status().isOk())
                .andExpect(jsonPath("$.points[1].title").value("Caja descuadrada"));
        api.getWith(s, "/api/v1/ai/digest/settings").andExpect(jsonPath("$.used").value(1));
        MailMessage mail = mailbox.last(owner.email(), "resumen-del-dia").orElseThrow();
        assertThat(mail.subject()).startsWith("⛈️ Aska · El clima de");
        assertThat(mail.senderName()).isEqualTo("Aska de XASKA");
        assertThat(mail.from("XASKA POS <no-responder@xaska.co>")).isEqualTo("Aska de XASKA <no-responder@xaska.co>");
        assertThat(mail.html()).contains("Tormenta").contains("Pronóstico para mañana")
                .contains("/app?aska=%C2%BFQu%C3%A9+pas%C3%B3+con+la+caja%3F");
        assertThat(mail.text()).contains("⛈️ Tormenta · $0").contains("Caja descuadrada: Faltan $2.000 en Caja 1.")
                .contains("Ticket: $0").contains("⛈️ Caja: Tormenta").contains("☀️ Cobros y pagos: Soleado")
                .contains("Pronóstico para mañana: Los martes").contains("Aska, la IA de XASKA");
    }
}
