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
    private final com.poshibrido.ai.application.AskaMomentService moments;
    private final com.poshibrido.ai.application.AskaRecapService recaps;

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

    /**
     * Aska en el momento del dolor (decisión 308): si el negocio tiene XASKA IA, si quien mira puede probarla y si el
     * inventario está vacío. Para quien ingresa compras, crea productos o ve existencias; no usa la IA.
     */
    @GetMapping("/moments")
    @PreAuthorize("hasAuthority('purchases:receive') or hasAuthority('products:manage') or hasAuthority('inventory:read')")
    public com.poshibrido.ai.application.AskaMomentService.Moments moments() {
        return moments.moments();
    }

    /** "Lo que hiciste con Aska" el mes pasado (decisión 309), para Inicio los primeros 7 días del mes; 204 si no hay. */
    @GetMapping("/recap")
    @PreAuthorize("hasAuthority('settings:manage')")
    public org.springframework.http.ResponseEntity<com.poshibrido.ai.application.AskaRecapService.Recap> recap() {
        var r = recaps.forHome();
        return r == null ? org.springframework.http.ResponseEntity.noContent().build()
                : org.springframework.http.ResponseEntity.ok(r);
    }
}
