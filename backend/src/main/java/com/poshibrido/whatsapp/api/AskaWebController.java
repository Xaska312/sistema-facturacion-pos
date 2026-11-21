package com.poshibrido.whatsapp.api;

import com.poshibrido.whatsapp.application.AskaWebChat;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

/**
 * Chat de Aska para xaska.co (decisión 364). Público (SecurityConfig) y con CORS solo para las páginas de
 * {@code ASKA_WEB_ORIGINS}; la sesión es un UUID aleatorio que guarda el navegador.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping(AskaWebController.PATH)
public class AskaWebController {

    public static final String PATH = "/api/v1/public/aska/chat";

    private final AskaWebChat chat;

    public record SendRequest(@NotNull UUID session, @Size(max = 2000) String text) {
    }

    @PostMapping
    public AskaWebChat.View send(@Valid @RequestBody SendRequest request, HttpServletRequest http) {
        return chat.send(request.session(), request.text(), http.getRemoteAddr());
    }

    /** La conversación (al volver a la página) o, con {@code after}, lo nuevo de XASKA (respuestas de una persona). */
    public record RateRequest(@jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(5) int score,
                              @Size(max = 500) String comment) {
    }

    /** La calificación de la conversación cerrada (decisión 375). */
    @PostMapping("/{session}/rating")
    public AskaWebChat.View rate(@PathVariable UUID session, @Valid @RequestBody RateRequest request,
                                 HttpServletRequest http) {
        return chat.rate(session, request.score(), request.comment(), http.getRemoteAddr());
    }

    @GetMapping("/{session}")
    public AskaWebChat.View read(@PathVariable UUID session, @RequestParam(required = false) Instant after) {
        return chat.since(session, after);
    }
}
