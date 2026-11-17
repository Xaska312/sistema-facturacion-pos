package com.poshibrido.whatsapp.application;

import com.poshibrido.whatsapp.api.WhatsAppWebhookControllerAccess;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Message;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Partes del agente de WhatsApp que no necesitan base de datos (decisión 362). */
class WhatsAppAgentTest {

    private static Message m(String author, String body) {
        return new Message(null, author, body, Instant.now());
    }

    @Test
    void historyStartsAndEndsWithThePersonAndJoinsRepeatedTurns() {
        List<Map<String, Object>> out = WhatsAppAgent.messages(List.of(m("BOT", "suelto"), m("CUSTOMER", "hola"),
                m("CUSTOMER", "¿precios?"), m("BOT", "Te cuento"), m("HUMAN", "Soy Daniel"), m("CUSTOMER", "gracias")));
        assertThat(out).extracting(x -> x.get("role")).containsExactly("user", "assistant", "user");
        assertThat(out.getFirst().get("content")).isEqualTo("hola\n¿precios?");
        assertThat(out.get(1).get("content")).isEqualTo("Te cuento\nSoy Daniel");
        assertThat(WhatsAppAgent.messages(List.of(m("CUSTOMER", "a"), m("BOT", "b")))).hasSize(1);
    }

    @Test
    void textLooksLikeWhatsApp() {
        assertThat(WhatsAppAgent.whatsappText("## Planes\nEl **Negocio** vale $69.900. [Consultó: Planes]"))
                .isEqualTo("Planes\nEl *Negocio* vale $69.900.");
        assertThat(WhatsAppAgent.whatsappText("x".repeat(2000))).hasSize(WhatsAppAgent.MAX_REPLY);
    }

    @Test
    void readsOnlyMessagesFromMetaNotices() {
        Map<String, Object> notice = Map.of("object", "whatsapp_business_account", "entry", List.of(Map.of(
                "changes", List.of(Map.of("value", Map.of(
                        "contacts", List.of(Map.of("profile", Map.of("name", "Marta"))),
                        "messages", List.of(Map.of("from", "+57 300 111 2233", "id", "wamid.1", "type", "text",
                                        "text", Map.of("body", "Hola")),
                                Map.of("from", "573001112233", "id", "wamid.2", "type", "image")),
                        "statuses", List.of(Map.of("id", "wamid.0", "status", "read"))))))));
        List<WhatsAppInbound.Incoming> in = WhatsAppInbound.parse(notice);
        assertThat(in).hasSize(2);
        assertThat(in.getFirst()).isEqualTo(new WhatsAppInbound.Incoming("573001112233", "wamid.1", "Marta", "text", "Hola"));
        assertThat(in.get(1).type()).isEqualTo("image");
        assertThat(WhatsAppInbound.parse(Map.of("object", "page"))).isEmpty();
    }

    @Test
    void checksMetaSignatures() throws Exception {
        byte[] body = "{\"a\":1}".getBytes(StandardCharsets.UTF_8);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("s3cr3t".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String good = "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
        assertThat(WhatsAppWebhookControllerAccess.valid(body, good, "s3cr3t")).isTrue();
        assertThat(WhatsAppWebhookControllerAccess.valid(body, good, "otro")).isFalse();
        assertThat(WhatsAppWebhookControllerAccess.valid(body, "sha256=zz", "s3cr3t")).isFalse();
        assertThat(WhatsAppWebhookControllerAccess.valid(body, null, "s3cr3t")).isFalse();
    }

    @Test
    void knowsWhatIsConfigured() {
        WhatsAppProperties none = new WhatsAppProperties(null, "", null, null, null, null, null);
        assertThat(none.receives()).isFalse();
        assertThat(none.sends()).isFalse();
        assertThat(none.version()).isEqualTo("v25.0");
        assertThat(none.handoffTo()).isEqualTo("soporte@xaska.co");
        assertThat(none.background()).isTrue();
    }
}
