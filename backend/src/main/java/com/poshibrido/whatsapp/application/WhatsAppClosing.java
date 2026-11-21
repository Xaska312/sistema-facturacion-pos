package com.poshibrido.whatsapp.application;

import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Rating;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cierre de las conversaciones y su calificación (decisión 375). Una conversación se cierra cuando alguien de XASKA
 * toca "Cerrar", cuando Aska se despide (la persona dijo que era todo) o tras 30 minutos sin que la persona responda
 * (con Aska o con una persona). Al cerrar se le pide calificar de 1 a 5: en WhatsApp con una lista para tocar, en
 * xaska.co con estrellas. Si califica 3 o menos, se le pregunta qué mejorar y su siguiente mensaje queda como
 * comentario. Responder a eso no reabre la conversación; escribir otra cosa, sí.
 */
@Slf4j
@Service
public class WhatsAppClosing {

    /** Cuánto se espera a que la persona responda antes de cerrar. */
    public static final Duration IDLE = Duration.ofMinutes(30);
    static final String IDLE_TEXT = "Como no volvimos a saber de ti, cerramos esta conversación por ahora. Si necesitas "
            + "algo más, escríbenos cuando quieras 👋";
    static final String WEB_RATING_TEXT = "¿Cómo te atendimos? Califica de 1 a 5 ⭐";
    static final String THANKS = "¡Gracias por calificarnos! 🙌 Si necesitas algo más, aquí estamos.";
    static final String ASK_COMMENT = "Gracias por decirnos. ¿Qué podemos mejorar? Cuéntanos en un mensaje: lo lee el "
            + "equipo de XASKA.";
    static final String THANKS_COMMENT = "Gracias, ya se lo pasamos al equipo de XASKA. Si necesitas algo más, escríbenos "
            + "cuando quieras.";

    /** "5", "5 estrellas", "⭐⭐⭐⭐": una calificación escrita a mano en vez de tocar la lista. */
    private static final Pattern WRITTEN = Pattern.compile("^\\s*([1-5])\\s*(estrellas?|⭐)?\\s*[.!]*\\s*$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    private static final Pattern STARS = Pattern.compile("^\\s*(⭐){1,5}\\s*$");

    private final WhatsAppConversations conversations;
    private final WhatsAppClient client;

    public WhatsAppClosing(WhatsAppConversations conversations, WhatsAppClient client) {
        this.conversations = conversations;
        this.client = client;
    }

    /**
     * Cierra la conversación y pide la calificación si todavía se le puede escribir. {@code closedBy}: IDLE, BOT o
     * XASKA. Nunca lanza por un envío fallido (queda cerrada igual).
     */
    public void close(Conversation conversation, String closedBy) {
        String attendedBy = conversation.status() == Status.HUMAN ? "HUMAN" : "BOT";
        conversations.setStatus(conversation.id(), Status.CLOSED);
        if (!conversation.windowOpen()) {
            return;
        }
        if (conversation.web()) {
            if ("IDLE".equals(closedBy)) {
                conversations.outbound(conversation.id(), "BOT", IDLE_TEXT, null);
            }
            conversations.outbound(conversation.id(), "BOT", WEB_RATING_TEXT, null);
            conversations.requestRating(conversation.id(), attendedBy, closedBy);
            return;
        }
        try {
            if ("IDLE".equals(closedBy)) {
                String id = client.sendText(conversation.target(), IDLE_TEXT);
                conversations.outbound(conversation.id(), "BOT", IDLE_TEXT, id);
            }
            String id = client.sendRatingList(conversation.target());
            conversations.outbound(conversation.id(), "BOT", WhatsAppClient.RATING_PROMPT, id);
            conversations.requestRating(conversation.id(), attendedBy, closedBy);
        } catch (WhatsAppClient.SendException ex) {
            log.warn("No se pudo pedir la calificación por WhatsApp: {}", ex.getMessage());
        }
    }

    /** Cada minuto: cierra las conversaciones en las que la persona lleva 30 minutos sin responder. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    public void closeIdle() {
        for (Conversation conversation : conversations.idle(IDLE)) {
            try {
                close(conversation, "IDLE");
            } catch (RuntimeException ex) {
                log.warn("No se pudo cerrar una conversación inactiva: {}", ex.getMessage());
            }
        }
    }

    /**
     * Si lo que llegó por WhatsApp es la respuesta a la calificación o al "¿qué podemos mejorar?" de una conversación
     * cerrada, lo guarda (sin reabrirla), agradece y devuelve verdadero. Si no, falso: es un mensaje normal.
     */
    public boolean answer(WhatsAppInbound.Incoming in, String body) {
        Optional<Conversation> found = conversations.find(in.from(), in.userId());
        if (found.isEmpty() || found.get().status() != Status.CLOSED) {
            return false;
        }
        Conversation conversation = found.get();
        Integer score = score(in.replyId(), in.text());
        Optional<Rating> pending = score == null ? Optional.empty() : conversations.pendingRating(conversation.id());
        Optional<Rating> commenting = pending.isPresent() || in.text() == null || in.text().isBlank()
                ? Optional.empty() : conversations.pendingComment(conversation.id());
        if (pending.isEmpty() && commenting.isEmpty()) {
            return false;
        }
        if (conversations.inbound(in.from(), in.userId(), in.profileName(), in.waMessageId(), body, false).isEmpty()) {
            return true; // Meta lo reenvió: ya se había guardado.
        }
        String reply;
        if (pending.isPresent()) {
            conversations.rate(pending.get().id(), score, null);
            reply = score <= 3 ? ASK_COMMENT : THANKS;
        } else {
            conversations.comment(commenting.get().id(), body);
            reply = THANKS_COMMENT;
        }
        try {
            String id = client.sendText(conversation.target(), reply);
            conversations.outbound(conversation.id(), "BOT", reply, id);
        } catch (WhatsAppClient.SendException ex) {
            log.warn("No se pudo agradecer la calificación por WhatsApp: {}", ex.getMessage());
        }
        return true;
    }

    /** La calificación de la página: estrellas y, si quiere, un comentario. */
    public void rateWeb(UUID session, int score, String comment) {
        Conversation conversation = conversations.byWebSession(session).orElseThrow(
                () -> new com.poshibrido.shared.error.NotFoundException("No hay una conversación para calificar."));
        Rating pending = conversations.pendingRating(conversation.id()).orElseThrow(
                () -> new com.poshibrido.shared.error.BusinessRuleException("Esta conversación ya se calificó."));
        conversations.rate(pending.id(), score, comment);
        boolean commented = comment != null && !comment.isBlank();
        conversations.outbound(conversation.id(), "BOT", commented ? THANKS_COMMENT : THANKS, null);
    }

    /** La calificación de una respuesta: el id de la lista ("rating_4") o un número del 1 al 5 escrito. */
    static Integer score(String replyId, String text) {
        if (replyId != null && replyId.matches("rating_[1-5]")) {
            return Integer.parseInt(replyId.substring("rating_".length()));
        }
        if (text == null) {
            return null;
        }
        Matcher written = WRITTEN.matcher(text);
        if (written.matches()) {
            return Integer.parseInt(written.group(1));
        }
        if (STARS.matcher(text).matches()) {
            return text.strip().codePoints().filter(c -> c == 0x2B50).toArray().length;
        }
        return null;
    }
}
