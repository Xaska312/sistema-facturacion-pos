package com.poshibrido.ai.api;

import com.poshibrido.ai.application.AskService;
import com.poshibrido.ai.application.AskService.Answer;
import com.poshibrido.ai.application.AskService.Turn;
import com.poshibrido.ai.application.AskService.Usage;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** XASKA IA: "Pregúntale a tu negocio" (decisión 296). Permiso {@code ai:ask} (del adicional XASKA IA). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai")
public class AskController {

    private final AskService asks;
    private final com.poshibrido.ai.application.AiTeaserService teaser;

    public record AskRequest(@NotBlank @Size(max = 500) String question, @Size(max = 20) List<Turn> history) {
    }

    @PostMapping("/ask")
    @PreAuthorize("hasAuthority('ai:ask')")
    public Answer ask(@Valid @RequestBody AskRequest request) {
        return asks.ask(request.question(), request.history());
    }

    @GetMapping("/usage")
    @PreAuthorize("hasAuthority('ai:ask')")
    public Usage usage() {
        return asks.usage();
    }

    /** "Aska encontró…" en Inicio para quien no tiene XASKA IA (decisión 302); no usa la IA. */
    @GetMapping("/teaser")
    @PreAuthorize("hasAuthority('inventory:read') or hasAuthority('reports:read')")
    public com.poshibrido.ai.application.AiTeaserService.Teaser teaser() {
        return teaser.teaser();
    }
}
