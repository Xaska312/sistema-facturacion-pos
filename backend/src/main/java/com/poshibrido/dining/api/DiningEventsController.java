package com.poshibrido.dining.api;

import com.poshibrido.access.application.MemberStatusChanged;
import com.poshibrido.dining.application.DiningEvents;
import com.poshibrido.dining.application.DiningEvents.Event;
import com.poshibrido.dining.application.DiningService;
import com.poshibrido.dining.application.DiningViews.BranchOption;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.annotation.PreDestroy;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Avisos en tiempo real de mesas y cocina (Fase 12b-4, decisión 271) por Server-Sent Events. Cada aviso trae solo el
 * tipo y los ids ("salió la comanda #12 de Mesa 4"); la pantalla vuelve a pedir los datos con sus permisos. Solo llegan
 * los avisos del negocio del token y de las sucursales que el usuario atiende.
 *
 * <p>El flujo dura como mucho {@link #TIMEOUT} (menos que el token de acceso): el navegador se vuelve a conectar con
 * el token renovado. Cada 25 s va un comentario para que los proxies no corten la conexión.
 *
 * <p>Cada persona tiene como máximo {@link #MAX_PER_USER} conexiones abiertas por negocio (decisiones 277 y 291): una
 * pantalla nueva cierra la más vieja, así una cuenta no puede acaparar conexiones del servidor. A la que se cierra se le
 * manda antes el aviso {@code REPLACED} para que no se vuelva a conectar sola (si lo hiciera, sacaría a otra y así en
 * cadena). Cada pestaña manda su identificador ({@code client}): su conexión nueva reemplaza en silencio a la anterior
 * de la misma pestaña, que el navegador ya soltó pero el servidor aún no sabe. Al desactivar a alguien se cierran
 * todas las suyas.
 */
@RestController
@RequestMapping("/api/v1/dining")
public class DiningEventsController {

    static final Duration TIMEOUT = Duration.ofMinutes(10);
    static final Duration HEARTBEAT = Duration.ofSeconds(25);
    /**
     * Cabe un restaurante que usa una sola cuenta "Cocina" en varias estaciones y pantallas; cada conexión casi no
     * gasta (no ocupa un hilo). Más ya no es uso normal.
     */
    static final int MAX_PER_USER = 10;
    /** Identificador de la pestaña: lo genera el navegador; se acepta solo uno corto y sencillo. */
    private static final Pattern CLIENT_ID = Pattern.compile("[A-Za-z0-9-]{8,64}");

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
    public SseEmitter stream(@RequestParam(name = "client", required = false) String client) {
        UUID tenantId = TenantContext.current().map(TenantRef::id)
                .orElseThrow(() -> new ForbiddenException("Entra a un negocio para recibir avisos."));
        UUID userId = CurrentActor.requireUserId();
        Set<UUID> branches = dining.branches().stream().map(BranchOption::id).collect(Collectors.toUnmodifiableSet());
        SseEmitter emitter = new SseEmitter(TIMEOUT.toMillis());
        String clientId = client != null && CLIENT_ID.matcher(client).matches() ? client : null;
        Subscription subscription = new Subscription(tenantId, userId, clientId, branches, emitter, System.nanoTime());
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
        // La conexión anterior de esta misma pestaña (se renovó o se reconectó): se cierra sin aviso.
        List<Subscription> previous = open.stream()
                .filter(o -> o.isSameScreen(subscription))
                .toList();
        previous.forEach(this::close);
        // Antes de sacar a alguien, se descartan las que ya no responden (pestañas cerradas que aún no lo sabemos).
        if (openFor(tenantId, userId) >= MAX_PER_USER) {
            open.stream().filter(o -> o.belongsTo(tenantId, userId) && !o.comment("ping")).toList()
                    .forEach(this::close);
        }
        List<Subscription> extra;
        synchronized (open) {
            open.add(subscription);
            List<Subscription> mine = open.stream()
                    .filter(o -> o.belongsTo(tenantId, userId))
                    .sorted(Comparator.comparingLong(Subscription::openedAt))
                    .toList();
            extra = mine.subList(0, Math.max(0, mine.size() - MAX_PER_USER));
            extra.forEach(open::remove);
        }
        events.subscribe(subscription);
        extra.forEach(this::replace);
        return emitter;
    }

    /** Conexiones abiertas de una persona en un negocio (para pruebas). */
    long openFor(UUID tenantId, UUID userId) {
        return open.stream().filter(o -> o.belongsTo(tenantId, userId)).count();
    }

    /** A quien desactivan se le cierran los avisos (su sesión ya no sirve: ActiveMemberFilter). */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    void onMemberStatusChanged(MemberStatusChanged event) {
        if (event.active()) {
            return;
        }
        open.stream().filter(o -> o.belongsTo(event.tenantId(), event.memberId())).toList().forEach(this::close);
    }

    /** Otra pantalla de la misma persona ocupó su lugar: se le avisa para que no se reconecte sola. */
    private void replace(Subscription subscription) {
        subscription.notice("REPLACED");
        close(subscription);
    }

    private void close(Subscription subscription) {
        open.remove(subscription);
        events.unsubscribe(subscription);
        try {
            subscription.emitter().complete();
        } catch (IllegalStateException ex) {
            // Ya estaba cerrada.
        }
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
    record Subscription(UUID tenantId, UUID userId, String clientId, Set<UUID> branchIds, SseEmitter emitter,
                        long openedAt) implements DiningEvents.Listener {

        boolean belongsTo(UUID tenant, UUID user) {
            return tenantId.equals(tenant) && userId.equals(user);
        }

        /** La misma pestaña del navegador (otra conexión suya). */
        boolean isSameScreen(Subscription other) {
            return clientId != null && other != this && clientId.equals(other.clientId)
                    && belongsTo(other.tenantId, other.userId);
        }

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

        /** Aviso de control para el navegador (no es de mesas ni de cocina). */
        void notice(String name) {
            try {
                synchronized (emitter) {
                    emitter.send(SseEmitter.event().name(name).data(Map.of("reason", name), MediaType.APPLICATION_JSON));
                }
            } catch (IOException | IllegalStateException ex) {
                // Ya no estaba: se cierra igual.
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
