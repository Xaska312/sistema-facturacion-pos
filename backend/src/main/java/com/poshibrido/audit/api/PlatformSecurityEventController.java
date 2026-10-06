package com.poshibrido.audit.api;

import com.poshibrido.audit.application.SecurityEventQueryService;
import com.poshibrido.audit.application.SecurityEventQueryService.SecurityEventView;
import com.poshibrido.shared.api.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

/**
 * Eventos de seguridad de la plataforma (inicios de sesión, intentos fallidos, bloqueos, límites superados,
 * negocios creados). Solo administradores de plataforma (SecurityConfig: {@code /api/v1/platform/**}).
 * La pantalla llega con la consola de plataforma (Fase 7-3).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/security-events")
public class PlatformSecurityEventController {

    private final SecurityEventQueryService events;

    @GetMapping
    public PageResponse<SecurityEventView> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) String event,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return events.list(from, to, event, userId, q, page, size);
    }
}
