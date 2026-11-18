package com.poshibrido.whatsapp.application;

import com.poshibrido.ai.application.AnthropicMessages;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Detail;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Lo que hace alguien de XASKA desde la consola de plataforma con las conversaciones de WhatsApp (decisión 362). */
@Service
@RequiredArgsConstructor
public class WhatsAppConsole {

    private final WhatsAppConversations conversations;
    private final WhatsAppClient client;
    private final WhatsAppProperties properties;
    private final AnthropicMessages ai;

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
                waId = client.sendText(conversation.phone(), body);
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

    public Detail setStatus(UUID id, Status status) {
        conversations.setStatus(id, status);
        return conversations.detail(id);
    }
}
