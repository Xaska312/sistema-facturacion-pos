package com.poshibrido.config;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.shared.error.TooManyRequestsException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Límite de peticiones para toda la API ({@code /api/**}), por usuario (claim {@code sub} del token) o por IP si no
 * hay sesión. Ventana fija de un minuto, en memoria (una sola instancia del backend).
 * <ul>
 *   <li>General: {@code app.rate-limit.api-per-minute} (300 por defecto). Un cajero con lector de códigos hace
 *       unas pocas por venta; un script abusivo las supera.</li>
 *   <li>Pesadas: {@code app.rate-limit.heavy-per-minute} (20): descargas CSV, importar productos y cerrar un
 *       negocio (pide contraseña). Cuentan además en el límite general.</li>
 * </ul>
 * Va después de la autenticación (necesita el usuario). La primera petición rechazada de cada clave y ventana queda
 * como RATE_LIMITED en los eventos de seguridad.
 */
@Slf4j
public class ApiRateLimitFilter extends OncePerRequestFilter {

    static final long WINDOW_MILLIS = 60_000;
    private static final int MAX_TRACKED_KEYS = 50_000;
    private static final Pattern HEAVY = Pattern.compile(
            "^/api/v1/(.*\\.csv|products/import|tenants/[^/]+/close)$");

    private final int generalLimit;
    private final int heavyLimit;
    private final HandlerExceptionResolver exceptionResolver;
    private final SecurityEventLogger securityEvents;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public ApiRateLimitFilter(RateLimitProperties properties, HandlerExceptionResolver exceptionResolver,
                              SecurityEventLogger securityEvents) {
        this.generalLimit = properties.apiPerMinute();
        this.heavyLimit = properties.heavyPerMinute();
        this.exceptionResolver = exceptionResolver;
        this.securityEvents = securityEvents;
    }

    /** La ruta cuenta en el límite de operaciones pesadas. */
    static boolean isHeavy(String path) {
        return HEAVY.matcher(path).matches();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return generalLimit <= 0 || !request.getRequestURI().startsWith("/api/")
                || "OPTIONS".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String who = clientKey(request);
        long now = System.currentTimeMillis();
        cleanUpIfNeeded(now);

        Window general = hit("api|" + who, now);
        if (general.count() > generalLimit) {
            reject(request, response, general, generalLimit, now, "api", path, who);
            return;
        }
        if (heavyLimit > 0 && isHeavy(path)) {
            Window heavy = hit("heavy|" + who, now);
            if (heavy.count() > heavyLimit) {
                reject(request, response, heavy, heavyLimit, now, "heavy", path, who);
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static String clientKey(HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            return "u:" + jwt.getSubject();
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static UUID userIdOf(String who) {
        if (!who.startsWith("u:")) {
            return null;
        }
        try {
            return UUID.fromString(who.substring(2));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private Window hit(String key, long now) {
        return windows.compute(key, (k, current) ->
                current == null || now - current.start() >= WINDOW_MILLIS
                        ? new Window(now, 1)
                        : new Window(current.start(), current.count() + 1));
    }

    private void cleanUpIfNeeded(long now) {
        if (windows.size() > MAX_TRACKED_KEYS) {
            windows.entrySet().removeIf(e -> now - e.getValue().start() >= WINDOW_MILLIS);
        }
    }

    private void reject(HttpServletRequest request, HttpServletResponse response, Window window, int limit, long now,
                        String scope, String path, String who) {
        if (window.count() == limit + 1) {
            try {
                securityEvents.record(SecurityEvent.RATE_LIMITED, userIdOf(who), null, null,
                        Map.of("path", path, "scope", scope));
            } catch (RuntimeException ex) {
                // Si la base no responde, el límite se aplica igual.
                log.warn("No se pudo registrar el límite superado en {}", path, ex);
            }
        }
        long retryAfter = Math.max(1, (window.start() + WINDOW_MILLIS - now) / 1000);
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        String message = "heavy".equals(scope)
                ? "Demasiadas descargas o importaciones seguidas. Espera un momento e intenta de nuevo."
                : "Demasiadas solicitudes seguidas. Espera un momento e intenta de nuevo.";
        exceptionResolver.resolveException(request, response, null, new TooManyRequestsException(message));
    }

    private record Window(long start, int count) {
    }
}
