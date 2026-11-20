package com.poshibrido.whatsapp.application;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.TooManyRequestsException;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Message;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Chat de Aska en xaska.co (decisión 364): el mismo agente de WhatsApp, con la sesión del navegador en lugar del
 * número. Responde de una vez (la página espera). Es público y cada respuesta cuesta IA, por eso tiene tres topes:
 * mensajes por IP cada 10 minutos, respuestas por conversación al día (las mismas 40 de WhatsApp) y respuestas de todo
 * el chat web al día; pasado este último, invita a escribir por WhatsApp sin gastar IA.
 */
@Slf4j
@Service
public class AskaWebChat {

    static final int MAX_TEXT = 1000;
    static final Duration IP_WINDOW = Duration.ofMinutes(10);
    static final String BUSY = "En este momento tengo muchas conversaciones 🙈 Escríbenos por WhatsApp y te atendemos: "
            + "https://wa.me/" + WhatsAppAgent.XASKA_WHATSAPP;
    private static final int MAX_TRACKED_IPS = 10_000;

    private final WhatsAppConversations conversations;
    private final WhatsAppAgent agent;
    private final AskaWebProperties properties;
    private final WhatsAppClosing closing;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Map<UUID, Object> locks = new ConcurrentHashMap<>();

    public AskaWebChat(WhatsAppConversations conversations, WhatsAppAgent agent, AskaWebProperties properties,
                       WhatsAppClosing closing) {
        this.closing = closing;
        this.conversations = conversations;
        this.agent = agent;
        this.properties = properties;
    }

    /**
     * Lo que ve la página: si sigue con Aska o con una persona, los mensajes de XASKA nuevos y si se le está pidiendo
     * calificar la conversación (decisión 375).
     */
    public record View(String status, List<Message> messages, boolean ratingPending) {
    }

    /** La persona escribe: se guarda y, si la conversación está con Aska, se responde. */
    public View send(UUID session, String text, String ip) {
        if (session == null) {
            throw new BusinessRuleException("Falta la sesión del chat.");
        }
        String body = text == null ? "" : text.strip();
        if (body.isEmpty()) {
            throw new BusinessRuleException("Escribe tu mensaje.");
        }
        if (body.length() > MAX_TEXT) {
            body = body.substring(0, MAX_TEXT);
        }
        limitIp(ip);
        Instant before = Instant.now();
        Conversation conversation = conversations.webInbound(session, body);
        synchronized (locks.computeIfAbsent(conversation.id(), k -> new Object())) {
            conversation = conversations.get(conversation.id());
            if (conversation.status() == Status.BOT) {
                respond(conversation);
            }
        }
        return since(session, before);
    }

    /** Los mensajes de XASKA (Aska o una persona) después de un momento; sin momento, toda la conversación. */
    public View since(UUID session, Instant after) {
        return conversations.byWebSession(session).map(c -> new View(c.status().name(),
                        conversations.recent(c.id(), 200).stream()
                                .filter(m -> after == null ? true : m.createdAt().isAfter(after) && !"CUSTOMER".equals(m.author()))
                                .toList(),
                        c.status() == Status.CLOSED && conversations.pendingRating(c.id()).isPresent()))
                .orElseGet(() -> new View(Status.BOT.name(), List.of(), false));
    }

    /** La persona califica desde la página (estrellas y, si quiere, un comentario). */
    public View rate(UUID session, int score, String comment, String ip) {
        limitIp(ip);
        Instant before = Instant.now();
        closing.rateWeb(session, score, comment);
        return since(session, before);
    }

    private void respond(Conversation conversation) {
        Instant dayAgo = Instant.now().minus(Duration.ofDays(1));
        String reply;
        if (conversations.webBotRepliesSince(dayAgo) >= properties.daily()) {
            reply = BUSY;
        } else if (conversations.botRepliesSince(conversation.id(), dayAgo) >= WhatsAppInbound.DAILY_BOT_REPLIES) {
            agent.handoff(conversation, "La conversación del chat web pasó el tope de respuestas de Aska en un día.", null);
            return;
        } else {
            WhatsAppAgent.Reply answer = agent.reply(conversation);
            conversations.outbound(conversation.id(), "BOT", answer.text(), null);
            if (answer.closed() && !answer.handedOff()) {
                closing.close(conversations.get(conversation.id()), "BOT");
            }
            return;
        }
        conversations.outbound(conversation.id(), "BOT", reply, null);
    }

    private void limitIp(String ip) {
        String key = ip == null ? "?" : ip;
        long now = System.currentTimeMillis();
        long window = IP_WINDOW.toMillis();
        if (windows.size() > MAX_TRACKED_IPS) {
            windows.entrySet().removeIf(e -> now - e.getValue().start() >= window);
        }
        Window w = windows.compute(key, (k, current) -> current == null || now - current.start() >= window
                ? new Window(now, 1) : new Window(current.start(), current.count() + 1));
        if (w.count() > properties.ipLimit()) {
            throw new TooManyRequestsException("Escribiste muchos mensajes seguidos. Espera unos minutos o escríbenos "
                    + "por WhatsApp: https://wa.me/" + WhatsAppAgent.XASKA_WHATSAPP);
        }
    }

    private record Window(long start, int count) {
    }
}
