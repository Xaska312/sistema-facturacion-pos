package com.poshibrido.whatsapp.application;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Detail;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** Lo que hace alguien de XASKA desde la consola de plataforma con las conversaciones de WhatsApp (decisión 362). */
@Service
@RequiredArgsConstructor
public class WhatsAppConsole {

    private final WhatsAppConversations conversations;
    private final WhatsAppClient client;
    private final WhatsAppProperties properties;
    private final AnthropicMessages ai;
    private final WhatsAppClosing closing;

    /** Si el agente puede recibir, enviar y pensar, para el aviso de la pantalla. */
    public record State(boolean receives, boolean sends, boolean ai) {
    }

    public State state() {
        return new State(properties.receives(), properties.sends(), ai.available());
    }

    /** Responde una persona de XASKA: la conversación queda con ella (el agente deja de responder). */
    public Detail reply(UUID id, String text) {
        if (text == null || text.isBlank()) {
            throw new BusinessRuleException("Escribe el mensaje.");
        }
        Conversation conversation = conversations.get(id);
        conversations.requireWindow(conversation);
        String body = text.strip();
        String waId = null;
        if (!conversation.web()) {
            try {
                waId = client.sendText(conversation.target(), body);
            } catch (WhatsAppClient.SendException ex) {
                throw new BusinessRuleException(ex.getMessage());
            }
        }
        // En el chat de xaska.co no hay a dónde enviarlo: queda guardado y el chat lo muestra al consultar.
        conversations.outbound(id, "HUMAN", body, waId);
        if (conversation.status() != Status.HUMAN) {
            conversations.setStatus(id, Status.HUMAN);
        }
        return conversations.detail(id);
    }

    /** El texto de la plantilla de seguimiento tal como se aprobó en Meta; {{1}} nombre, {{2}} negocio (decisión 371). */
    public static final String FOLLOWUP_TEXT = "Hola {{1}}, soy Daniel de XASKA. Te escribo para saber cómo te va con "
            + "XASKA POS en {{2}}. ¿Tienes alguna duda o hay algo en lo que te podamos ayudar? Responde este mensaje y "
            + "te atiendo por aquí.";

    /**
     * Le escribe primero a un cliente desde el número de XASKA con la plantilla aprobada (decisión 371). La
     * conversación queda con una persona; cuando el cliente responde se sigue escribiendo desde la consola.
     */
    public Detail followUp(String rawPhone, String name, String business) {
        String phone = WhatsAppConversations.phone(rawPhone);
        if (phone == null) {
            throw new BusinessRuleException("Ese número no parece un celular válido.");
        }
        String who = firstName(name);
        String where = business == null || business.isBlank() ? "tu negocio" : business.strip();
        String waId;
        try {
            waId = client.sendTemplate(phone, properties.followup(), properties.language(), List.of(who, where));
        } catch (WhatsAppClient.SendException ex) {
            throw new BusinessRuleException(ex.getMessage());
        }
        Conversation conversation = conversations.followUp(phone, name, business);
        conversations.outbound(conversation.id(), "HUMAN",
                FOLLOWUP_TEXT.replace("{{1}}", who).replace("{{2}}", where), waId);
        return conversations.detail(conversation.id());
    }

    public java.util.Map<String, String> followUpTemplate() {
        return java.util.Map.of("name", properties.followup(), "language", properties.language(), "text", FOLLOWUP_TEXT);
    }

    /** "Carlos Rojas" → "Carlos"; sin nombre, "qué tal" (Meta no acepta variables vacías). */
    static String firstName(String name) {
        if (name == null || name.isBlank()) {
            return "qué tal";
        }
        String first = name.strip().split("\\s+")[0];
        return first.length() > 40 ? first.substring(0, 40) : first;
    }

    /** Cierra la conversación y le pide a la persona que califique (decisión 375). */
    public Detail close(UUID id) {
        Conversation conversation = conversations.get(id);
        if (conversation.status() != Status.CLOSED) {
            closing.close(conversation, "XASKA");
        }
        return conversations.detail(id);
    }

    public Detail setStatus(UUID id, Status status) {
        conversations.setStatus(id, status);
        return conversations.detail(id);
    }
}
