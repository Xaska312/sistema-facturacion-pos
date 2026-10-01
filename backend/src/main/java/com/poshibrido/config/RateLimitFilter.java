package com.poshibrido.config;

import com.poshibrido.shared.error.TooManyRequestsException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Límite de peticiones por IP (ventana fija de 1 minuto) para login, registro y consulta de invitaciones.
 * En memoria: suficiente para una instancia; con varias réplicas se moverá a Redis/proxy (Fase 7).
 * La IP se toma de {@code getRemoteAddr()}: detrás de un proxy, configurar
 * {@code server.forward-headers-strategy} para que refleje la IP real.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MILLIS = 60_000;
    private static final int MAX_TRACKED_KEYS = 10_000;

    private final Map<String, Integer> limits;
    private final HandlerExceptionResolver exceptionResolver;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitFilter(RateLimitProperties properties, HandlerExceptionResolver exceptionResolver) {
        this.limits = Map.of(
                "/api/v1/auth/login", properties.loginPerMinute(),
                "/api/v1/auth/register", properties.registerPerMinute(),
                "/api/v1/invitations/preview", properties.loginPerMinute());
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod()) || !limits.containsKey(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        int limit = limits.get(path);
        long now = System.currentTimeMillis();
        String key = path + "|" + request.getRemoteAddr();

        if (windows.size() > MAX_TRACKED_KEYS) {
            windows.entrySet().removeIf(e -> now - e.getValue().start() >= WINDOW_MILLIS);
        }
        Window window = windows.compute(key, (k, current) ->
                current == null || now - current.start() >= WINDOW_MILLIS
                        ? new Window(now, 1)
                        : new Window(current.start(), current.count() + 1));

        if (window.count() > limit) {
            long retryAfter = Math.max(1, (window.start() + WINDOW_MILLIS - now) / 1000);
            response.setHeader("Retry-After", String.valueOf(retryAfter));
            exceptionResolver.resolveException(request, response, null,
                    new TooManyRequestsException("Demasiados intentos. Espera un momento e intenta de nuevo."));
            return;
        }
        chain.doFilter(request, response);
    }

    private record Window(long start, int count) {
    }
}
