package com.poshibrido.whatsapp;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Agente de WhatsApp de XASKA (decisión 362): el webhook solo acepta avisos firmados por Meta, el asistente (aquí la IA
 * simulada) responde y guarda los datos de la persona, pasa la conversación a una persona con aviso por correo, y
 * desde la consola se responde dentro de las 24 horas.
 */
class WhatsAppAgentIT extends IntegrationTest {

    static final String HOOK = "/api/v1/public/whatsapp/webhook";

    @MockitoBean
    private AnthropicMessages ai;


    @BeforeEach
    void ai() {
        reset(ai, whatsapp);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        when(whatsapp.sendText(anyString(), anyString())).thenAnswer(i -> "wamid.salida-" + UUID.randomUUID());
    }

    private static Map<String, Object> usage() {
        return Map.of("input_tokens", 500, "output_tokens", 40);
    }

    private static String message(String from, String id, String text) {
        return """
                {"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages","value":{
                 "messaging_product":"whatsapp","contacts":[{"profile":{"name":"Marta"},"wa_id":"%s"}],
                 "messages":[{"from":"%s","id":"%s","timestamp":"1794900000","type":"text","text":{"body":"%s"}}]}}]}]}
                """.formatted(from, from, id, text);
    }

    private ResultActions signed(String json) throws Exception {
        return mvc.perform(post(HOOK).contentType(MediaType.APPLICATION_JSON).content(json)
                .header("X-Hub-Signature-256", "sha256=" + hmac(json)));
    }

    private static String hmac(String json) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("secreto-de-prueba".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(json.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void verifiesTheWebhookAndIgnoresUnsignedNotices() throws Exception {
        mvc.perform(get(HOOK).param("hub.mode", "subscribe").param("hub.verify_token", "token-de-prueba")
                .param("hub.challenge", "12345")).andExpect(status().isOk()).andExpect(content().string("12345"));
        mvc.perform(get(HOOK).param("hub.mode", "subscribe").param("hub.verify_token", "otro")
                .param("hub.challenge", "12345")).andExpect(status().isForbidden());
        String json = message("573000000001", "wamid.sinfirma", "Hola");
        mvc.perform(post(HOOK).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().isUnauthorized());
        mvc.perform(post(HOOK).contentType(MediaType.APPLICATION_JSON).content(json)
                .header("X-Hub-Signature-256", "sha256=00")).andExpect(status().isUnauthorized());
        verify(whatsapp, never()).sendText(anyString(), anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void theAssistantAnswersSavesTheLeadAndHandsOffToAPerson() throws Exception {
        String phone = "57300" + (System.nanoTime() % 10_000_000);
        doReturn(Map.of("stop_reason", "tool_use", "usage", usage(), "content", List.of(
                        Map.of("type", "tool_use", "id", "t1", "name", "registrar_datos",
                                "input", Map.of("nombre", "Marta", "negocio", "Tienda Marta, minimercado")),
                        Map.of("type", "tool_use", "id", "t2", "name", "planes_y_precios", "input", Map.of()))),
                Map.of("stop_reason", "end_turn", "usage", usage(), "content", List.of(
                        Map.of("type", "text", "text", "¡Hola, Marta! El plan **Negocio** te sirve. [Consultó: Planes]"))))
                .when(ai).send(any());

        String first = message(phone, "wamid.uno-" + phone, "Hola, tengo un minimercado. ¿Cuánto vale?");
        signed(first).andExpect(status().isOk());
        ArgumentCaptor<String> sent = ArgumentCaptor.forClass(String.class);
        verify(whatsapp).sendText(eq(phone), sent.capture());
        assertThat(sent.getValue()).isEqualTo("¡Hola, Marta! El plan *Negocio* te sirve.");
        ArgumentCaptor<Map<String, Object>> request = ArgumentCaptor.forClass(Map.class);
        verify(ai, times(2)).send(request.capture());
        assertThat(String.valueOf(request.getAllValues().getFirst().get("system")))
                .contains("asistente virtual de XASKA").contains("NO hace facturación electrónica");
        assertThat(String.valueOf(request.getAllValues().get(1).get("messages"))).contains("planes").contains("mensual");

        // El mismo aviso otra vez (Meta reenvía): no responde dos veces.
        signed(first).andExpect(status().isOk());
        verify(whatsapp, times(1)).sendText(anyString(), anyString());

        Session admin = platformAdmin();
        String list = api.getWith(admin, "/api/v1/platform/whatsapp/conversations").andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(list).contains(phone).contains("Tienda Marta, minimercado").contains("\"status\":\"BOT\"");
        UUID id = UUID.fromString(jdbc.queryForObject(
                "SELECT CAST(id AS text) FROM platform.wa_conversations WHERE phone = ?", String.class, phone));
        api.getWith(admin, "/api/v1/platform/whatsapp/conversations/" + id).andExpect(status().isOk())
                .andExpect(jsonPath("$.windowOpen").value(true))
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[1].author").value("BOT"));

        // Pide a una persona: el asistente le avisa al equipo por correo y deja de responder.
        reset(ai);
        when(ai.available()).thenReturn(true);
        when(ai.model()).thenReturn("claude-haiku-5-5");
        doReturn(Map.of("stop_reason", "tool_use", "usage", usage(), "content", List.of(
                        Map.of("type", "tool_use", "id", "t3", "name", "pasar_a_persona",
                                "input", Map.of("motivo", "Quiere cotizar equipos", "resumen", "Minimercado, 1 caja.")))),
                Map.of("stop_reason", "end_turn", "usage", usage(), "content", List.of(
                        Map.of("type", "text", "text", "Listo, Marta: alguien del equipo te escribe pronto."))))
                .when(ai).send(any());
        int mails = mailbox.sentTo("soporte@xaska.co").size();
        signed(message(phone, "wamid.dos-" + phone, "Quiero cotizar una impresora y un cajón")).andExpect(status().isOk());
        assertThat(mailbox.sentTo("soporte@xaska.co")).hasSize(mails + 1);
        assertThat(mailbox.sentTo("soporte@xaska.co").getLast().subject()).contains("quiere hablar con una persona");
        assertThat(mailbox.sentTo("soporte@xaska.co").getLast().text()).contains("Quiere cotizar equipos");
        api.getWith(admin, "/api/v1/platform/whatsapp/conversations/" + id)
                .andExpect(jsonPath("$.conversation.status").value("HUMAN"));
        clearInvocations(ai, whatsapp);
        signed(message(phone, "wamid.tres-" + phone, "¿Hola?")).andExpect(status().isOk());
        verify(ai, never()).send(any());
        verify(whatsapp, never()).sendText(anyString(), anyString());

        // Desde la consola responde una persona; luego la devuelve al asistente y la cierra.
        api.postWith(admin, "/api/v1/platform/whatsapp/conversations/" + id + "/reply", "{\"text\":\"Hola Marta, soy Daniel.\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.conversation.status").value("HUMAN"));
        assertThat(jdbc.queryForObject("""
                SELECT author FROM platform.wa_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1""",
                String.class, id)).isEqualTo("HUMAN");
        verify(whatsapp).sendText(phone, "Hola Marta, soy Daniel.");
        api.postEmpty(admin, "/api/v1/platform/whatsapp/conversations/" + id + "/bot")
                .andExpect(jsonPath("$.conversation.status").value("BOT"));
        api.postEmpty(admin, "/api/v1/platform/whatsapp/conversations/" + id + "/close")
                .andExpect(jsonPath("$.conversation.status").value("CLOSED"));

        // Pasadas 24 horas, WhatsApp no deja escribir con texto libre.
        jdbc.update("UPDATE platform.wa_conversations SET last_inbound_at = now() - interval '25 hours' WHERE id = ?", id);
        api.postWith(admin, "/api/v1/platform/whatsapp/conversations/" + id + "/reply", "{\"text\":\"¿Sigues ahí?\"}")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("24 horas")));
        api.getWith(admin, "/api/v1/platform/whatsapp/state").andExpect(jsonPath("$.receives").value(true))
                .andExpect(jsonPath("$.sends").value(true));
    }

    @Test
    void withoutAiItApologizesAndHandsOff() throws Exception {
        when(ai.available()).thenReturn(false);
        String phone = "57311" + (System.nanoTime() % 10_000_000);
        signed(message(phone, "wamid.sinia-" + phone, "Hola")).andExpect(status().isOk());
        verify(whatsapp).sendText(eq(phone), org.mockito.ArgumentMatchers.contains("una persona del equipo"));
        assertThat(jdbc.queryForObject("SELECT status FROM platform.wa_conversations WHERE phone = ?", String.class, phone))
                .isEqualTo("HUMAN");
    }

    @Test
    void onlyPlatformAdminsSeeTheConversations() throws Exception {
        Session owner = api.newTenant("wa-ajeno").tenant();
        api.getWith(owner, "/api/v1/platform/whatsapp/conversations").andExpect(status().isForbidden());
    }
}
