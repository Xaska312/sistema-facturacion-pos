package com.poshibrido.dining.api;

import com.poshibrido.dining.application.DiningEvents;
import com.poshibrido.dining.application.DiningEvents.Event;
import com.poshibrido.dining.application.DiningService;
import com.poshibrido.dining.application.DiningViews.BranchOption;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import com.poshibrido.shared.error.ForbiddenException;
import jakarta.annotation.PreDestroy;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Avisos en tiempo real de mesas y cocina (Fase 12b-4, decisión 271) por Server-Sent Events. Cada aviso trae solo el
 * tipo y los ids ("salió la comanda #12 de Mesa 4"); la pantalla vuelve a pedir los datos con sus permisos. Solo llegan
 * los avisos del negocio del token y de las sucursales que el usuario atiende.
 *
 * <p>El flujo dura como mucho {@link #TIMEOUT} (menos que el token de acceso): el navegador se vuelve a conectar con
 * el token renovado. Cada 25 s va un comentario para que los proxies no corten la conexión.
 */
@RestController
@RequestMapping("/api/v1/dining")
public class DiningEventsController {

    static final Duration TIMEOUT = Duration.ofMinutes(10);
    static final Duration HEARTBEAT = Duration.ofSeconds(25);

    private final DiningEvents events;
    private final DiningService dining;
    private final Set<Subscription> open = new CopyOnWriteArraySet<>();
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "dining-events-heartbeat");
        t.setDaemon(true);
        return t;
    });

    public DiningEventsController(DiningEvents events, DiningService dining) {
        this.events = events;
        this.dining = dining;
        heartbeat.scheduleAtFixedRate(this::beat, HEARTBEAT.toSeconds(), HEARTBEAT.toSeconds(), TimeUnit.SECONDS);
    }

    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyAuthority('tables:operate', 'kitchen:view') and hasAuthority('module:tables')")
    public SseEmitter stream() {
        UUID tenantId = TenantContext.current().map(TenantRef::id)
                .orElseThrow(() -> new ForbiddenException("Entra a un negocio para recibir avisos."));
        Set<UUID> branches = dining.branches().stream().map(BranchOption::id).collect(Collectors.toUnmodifiableSet());
        SseEmitter emitter = new SseEmitter(TIMEOUT.toMillis());
        Subscription subscription = new Subscription(tenantId, branches, emitter);
        Runnable close = () -> {
            open.remove(subscription);
            events.unsubscribe(subscription);
        };
        emitter.onCompletion(close);
        emitter.onTimeout(close);
        emitter.onError(e -> close.run());
        try {
            // Primer mensaje: el navegador sabe que quedó conectado.
            emitter.send(SseEmitter.event().name("READY").data(Map.of("branches", branches.size()),
                    MediaType.APPLICATION_JSON));
        } catch (IOException ex) {
            emitter.completeWithError(ex);
            return emitter;
        }
        open.add(subscription);
        events.subscribe(subscription);
        return emitter;
    }

    private void beat() {
        for (Subscription s : open) {
            if (!s.comment("ping")) {
                open.remove(s);
                events.unsubscribe(s);
            }
        }
    }

    @PreDestroy
    void stop() {
        heartbeat.shutdownNow();
        open.forEach(s -> s.emitter.complete());
    }

    /** Un navegador conectado. */
    record Subscription(UUID tenantId, Set<UUID> branchIds, SseEmitter emitter) implements DiningEvents.Listener {

        @Override
        public boolean deliver(Event event) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("type", event.type().name());
            data.put("branchId", event.branchId());
            data.put("tabId", event.tabId());
            data.put("ticketId", event.ticketId());
            data.put("number", event.number());
            data.put("stationId", event.stationId());
            data.put("label", event.label());
            data.put("status", event.status());
            data.put("userId", event.userId());
            try {
                synchronized (emitter) {
                    emitter.send(SseEmitter.event().name(event.type().name()).data(data, MediaType.APPLICATION_JSON));
                }
                return true;
            } catch (IOException | IllegalStateException ex) {
                return false;
            }
        }

        boolean comment(String text) {
            try {
                synchronized (emitter) {
                    emitter.send(SseEmitter.event().comment(text));
                }
                return true;
            } catch (IOException | IllegalStateException ex) {
                return false;
            }
        }
    }
}
