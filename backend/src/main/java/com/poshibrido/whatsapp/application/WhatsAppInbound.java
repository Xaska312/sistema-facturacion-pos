package com.poshibrido.whatsapp.application;

import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Lo que llega de Meta al webhook (decisión 362): guarda cada mensaje y, si la conversación está con el agente, le
 * responde. Se procesa en segundo plano para contestarle a Meta de una vez (si tarda, Meta reenvía el aviso).
 */
@Slf4j
@Service
public class WhatsAppInbound {

    /** Tope de respuestas del agente por conversación en un día; al pasarlo, la atiende una persona. */
    static final int DAILY_BOT_REPLIES = 40;
    static final int MAX_INBOUND = 2000;
    static final String ONLY_TEXT = "Por ahora solo puedo leer mensajes de texto. ¿Me lo cuentas por escrito?";

    private final WhatsAppConversations conversations;
    private final WhatsAppAgent agent;
    private final WhatsAppClient client;
    private final WhatsAppProperties properties;
    private final ExecutorService executor = Executors.newFixedThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "whatsapp-agent");
        thread.setDaemon(true);
        return thread;
    });

    public WhatsAppInbound(WhatsAppConversations conversations, WhatsAppAgent agent, WhatsAppClient client,
                           WhatsAppProperties properties) {
        this.conversations = conversations;
        this.agent = agent;
        this.client = client;
        this.properties = properties;
    }

    /** Un mensaje entrante ya leído del aviso de Meta. */
    public record Incoming(String from, String waMessageId, String profileName, String type, String text) {
    }

    /** Recibe el aviso (ya con la firma comprobada). */
    public void accept(Map<String, Object> payload) {
        List<Incoming> messages = parse(payload);
        if (messages.isEmpty()) {
            return;
        }
        Runnable job = () -> messages.forEach(this::handle);
        if (properties.background()) {
            executor.submit(job);
        } else {
            job.run();
        }
    }

    void handle(Incoming in) {
        try {
            boolean text = "text".equals(in.type()) && in.text() != null && !in.text().isBlank();
            String body = text ? clip(in.text()) : "[" + in.type() + "]";
            Optional<Conversation> stored = conversations.inbound(in.from(), in.profileName(), in.waMessageId(), body);
            if (stored.isEmpty()) {
                return;
            }
            Conversation conversation = stored.get();
            if (conversation.status() != Status.BOT) {
                return;
            }
            if (conversations.botRepliesSince(conversation.id(), Instant.now().minus(Duration.ofDays(1)))
                    >= DAILY_BOT_REPLIES) {
                agent.handoff(conversation, "La conversación pasó el tope de respuestas del asistente en un día.", null);
                return;
            }
            String reply;
            if (text) {
                reply = agent.reply(conversation).text();
            } else {
                reply = ONLY_TEXT;
            }
            send(conversation, reply);
        } catch (RuntimeException ex) {
            log.error("No se pudo procesar un mensaje de WhatsApp", ex);
        }
    }

    private void send(Conversation conversation, String text) {
        try {
            String id = client.sendText(conversation.phone(), text);
            conversations.outbound(conversation.id(), "BOT", text, id);
        } catch (WhatsAppClient.SendException ex) {
            log.warn("No se pudo responder por WhatsApp: {}", ex.getMessage());
        }
    }

    /** Los mensajes de un aviso de Meta: {@code entry[].changes[].value.messages[]} (los estados se ignoran). */
    @SuppressWarnings("unchecked")
    static List<Incoming> parse(Map<String, Object> payload) {
        if (payload == null || !"whatsapp_business_account".equals(payload.get("object"))) {
            return List.of();
        }
        List<Incoming> out = new java.util.ArrayList<>();
        for (Object entry : list(payload.get("entry"))) {
            for (Object change : list(((Map<String, Object>) entry).get("changes"))) {
                Map<String, Object> value = map(((Map<String, Object>) change).get("value"));
                String name = null;
                for (Object contact : list(value.get("contacts"))) {
                    Object profile = map(contact).get("profile");
                    if (profile != null && map(profile).get("name") != null) {
                        name = String.valueOf(map(profile).get("name"));
                    }
                }
                for (Object raw : list(value.get("messages"))) {
                    Map<String, Object> m = map(raw);
                    String from = m.get("from") == null ? null : String.valueOf(m.get("from")).replaceAll("\\D", "");
                    if (from == null || from.isEmpty() || from.length() > 20) {
                        continue;
                    }
                    String type = m.get("type") == null ? "unknown" : String.valueOf(m.get("type"));
                    String text = "text".equals(type) ? str(map(m.get("text")).get("body")) : null;
                    out.add(new Incoming(from, str(m.get("id")), name, type, text));
                }
            }
        }
        return out;
    }

    private static String clip(String text) {
        String t = text.strip();
        return t.length() > MAX_INBOUND ? t.substring(0, MAX_INBOUND) : t;
    }

    private static List<?> list(Object value) {
        return value instanceof List<?> l ? l : List.of();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
