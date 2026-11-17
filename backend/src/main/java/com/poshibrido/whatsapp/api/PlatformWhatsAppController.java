package com.poshibrido.whatsapp.api;

import com.poshibrido.whatsapp.application.WhatsAppConsole;
import com.poshibrido.whatsapp.application.WhatsAppConversations;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Conversation;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Detail;
import com.poshibrido.whatsapp.application.WhatsAppConversations.Status;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Conversaciones del agente de WhatsApp en la consola de plataforma (decisión 362). Solo administradores. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/whatsapp")
public class PlatformWhatsAppController {

    private final WhatsAppConversations conversations;
    private final WhatsAppConsole console;

    public record ReplyRequest(@NotBlank @Size(max = 2000) String text) {
    }

    @GetMapping("/state")
    public WhatsAppConsole.State state() {
        return console.state();
    }

    @GetMapping("/conversations")
    public List<Conversation> list(@RequestParam(required = false) Status status) {
        return conversations.list(status);
    }

    @GetMapping("/conversations/{id}")
    public Detail detail(@PathVariable UUID id) {
        return conversations.detail(id);
    }

    @PostMapping("/conversations/{id}/reply")
    public Detail reply(@PathVariable UUID id, @Valid @RequestBody ReplyRequest request) {
        return console.reply(id, request.text());
    }

    /** Vuelve a dejar la conversación con el asistente. */
    @PostMapping("/conversations/{id}/bot")
    public Detail toBot(@PathVariable UUID id) {
        return console.setStatus(id, Status.BOT);
    }

    /** La toma una persona sin escribir todavía (el asistente deja de responder). */
    @PostMapping("/conversations/{id}/take")
    public Detail take(@PathVariable UUID id) {
        return console.setStatus(id, Status.HUMAN);
    }

    @PostMapping("/conversations/{id}/close")
    public Detail close(@PathVariable UUID id) {
        return console.setStatus(id, Status.CLOSED);
    }
}
