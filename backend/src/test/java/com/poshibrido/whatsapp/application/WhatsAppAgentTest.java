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
        assertThat(WhatsAppAgent.whatsappText("x".repeat(4000))).hasSize(WhatsAppAgent.MAX_REPLY);
    }

    @Test
    void aCutReplyEndsInItsLastWholeSentence() {
        // Decisión 375: dos respuestas llegaron cortadas ("Así ves en"); se corta en la última frase completa.
        assertThat(WhatsAppAgent.wholeSentences("Para tus trabajos va por pedido. El flujo es así: creas el pedido. Así ves en"))
                .isEqualTo("Para tus trabajos va por pedido. El flujo es así: creas el pedido.");
        assertThat(WhatsAppAgent.wholeSentences("Uno dos tres\ncuatro")).isEqualTo("Uno dos tres");
        assertThat(WhatsAppAgent.wholeSentences("sin punto")).isEqualTo("sin punto…");
    }

    @Test
    void readsTheRatingFromTheListOrWrittenByHand() {
        assertThat(WhatsAppClosing.score("rating_4", "⭐⭐⭐⭐ 4")).isEqualTo(4);
        assertThat(WhatsAppClosing.score(null, " 5 ")).isEqualTo(5);
        assertThat(WhatsAppClosing.score(null, "3 estrellas")).isEqualTo(3);
        assertThat(WhatsAppClosing.score(null, "⭐⭐")).isEqualTo(2);
        assertThat(WhatsAppClosing.score(null, "6")).isNull();
        assertThat(WhatsAppClosing.score(null, "tengo 2 cajas")).isNull();
        assertThat(WhatsAppClosing.score("otro", null)).isNull();

        Map<String, Object> notice = Map.of("object", "whatsapp_business_account", "entry", List.of(Map.of(
                "changes", List.of(Map.of("value", Map.of("messages", List.of(Map.of("from", "573001112233",
                        "id", "wamid.r", "type", "interactive", "interactive", Map.of("type", "list_reply",
                                "list_reply", Map.of("id", "rating_5", "title", "⭐⭐⭐⭐⭐ 5"))))))))));
        assertThat(WhatsAppInbound.parse(notice).getFirst()).isEqualTo(new WhatsAppInbound.Incoming("573001112233",
                null, "wamid.r", null, "interactive", "⭐⭐⭐⭐⭐ 5", "rating_5"));

        @SuppressWarnings("unchecked")
        Map<String, Object> list = (Map<String, Object>) WhatsAppClient.ratingBody("573001112233").get("interactive");
        assertThat(list.get("type")).isEqualTo("list");
        assertThat(String.valueOf(list.get("action"))).contains("rating_1").contains("rating_5").contains("Calificar");
        WhatsAppClient.RATING_ROWS.forEach(r -> assertThat(r[1].length()).isLessThanOrEqualTo(24));
    }

    @Test
    void knowsWhetherThePersonIsAlreadyAClient() {
        assertThat(WhatsAppConversations.kind("CLIENTE")).isEqualTo("CLIENT");
        assertThat(WhatsAppConversations.kind("nuevo")).isEqualTo("NEW");
        assertThat(WhatsAppConversations.kind("quién sabe")).isNull();
        assertThat(WhatsAppConversations.kind(null)).isNull();
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
        assertThat(in.getFirst()).isEqualTo(new WhatsAppInbound.Incoming("573001112233", null, "wamid.1", "Marta", "text", "Hola"));
        assertThat(in.get(1).type()).isEqualTo("image");
        assertThat(WhatsAppInbound.parse(Map.of("object", "page"))).isEmpty();
    }

    @Test
    void readsPeopleWhoWriteWithAUsernameAndNoNumber() {
        // Decisión 368: con nombre de usuario, Meta puede mandar solo el identificador (BSUID) y no el número.
        Map<String, Object> notice = Map.of("object", "whatsapp_business_account", "entry", List.of(Map.of(
                "changes", List.of(Map.of("value", Map.of(
                        "contacts", List.of(Map.of("profile", Map.of("username", "andres.bar"), "user_id", "CO.1349120865530")),
                        "messages", List.of(
                                Map.of("from_user_id", "CO.1349120865530", "id", "wamid.u1", "type", "text",
                                        "text", Map.of("body", "Hola")),
                                Map.of("from_user_id", "<script>", "id", "wamid.u2", "type", "text",
                                        "text", Map.of("body", "x")))))))));
        List<WhatsAppInbound.Incoming> in = WhatsAppInbound.parse(notice);
        assertThat(in).containsExactly(
                new WhatsAppInbound.Incoming(null, "CO.1349120865530", "wamid.u1", "@andres.bar", "text", "Hola"));
        assertThat(WhatsAppInbound.userId("US.ENT.11815799212886844830")).isEqualTo("US.ENT.11815799212886844830");
        assertThat(WhatsAppClient.body("CO.1349120865530", "Hola")).containsEntry("recipient", "CO.1349120865530")
                .doesNotContainKey("to");
        assertThat(WhatsAppClient.body("573001112233", "Hola")).containsEntry("to", "573001112233")
                .doesNotContainKey("recipient");
    }

    @Test
    void followUpTemplateBits() {
        assertThat(WhatsAppConsole.firstName("  Carlos Andrés Rojas ")).isEqualTo("Carlos");
        assertThat(WhatsAppConsole.firstName(null)).isEqualTo("qué tal");
        assertThat(WhatsAppClient.metaError("{\"error\":{\"message\":\"(#132001) Template name does not exist\"}}"))
                .isEqualTo("(#132001) Template name does not exist");
        assertThat(WhatsAppClient.metaError("{\"error\":{\"message\":\"x\",\"error_data\":{\"details\":\"Faltan parámetros\"}}}"))
                .isEqualTo("Faltan parámetros");
        assertThat(WhatsAppClient.metaError("<html>")).isEqualTo("sin detalle");
        assertThat(new WhatsAppProperties(null, null, null, null, null, null, null, null, null, null).retention()).isEqualTo(12);
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
        WhatsAppProperties none = new WhatsAppProperties(null, "", null, null, null, null, null, null, null, null);
        assertThat(none.receives()).isFalse();
        assertThat(none.sends()).isFalse();
        assertThat(none.version()).isEqualTo("v25.0");
        assertThat(none.handoffTo()).isEqualTo("soporte@xaska.co");
        assertThat(none.background()).isTrue();
    }
}
