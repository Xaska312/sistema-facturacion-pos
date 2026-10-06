package com.poshibrido.shared.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Optional;

/**
 * Datos del cliente de la petición en curso (IP y navegador) para auditoría. Fuera de una petición HTTP
 * (tareas internas) devuelven {@code null}.
 *
 * <p>La IP es {@code getRemoteAddr()}: detrás de Caddy refleja al cliente real solo con
 * {@code server.forward-headers-strategy=native} (ver decisión 160).
 */
public final class ClientInfo {

    private static final int MAX_IP = 45;
    private static final int MAX_USER_AGENT = 255;

    private ClientInfo() {
    }

    public static String ip() {
        return request().map(HttpServletRequest::getRemoteAddr).map(ip -> truncate(ip, MAX_IP)).orElse(null);
    }

    public static String userAgent() {
        return request().map(r -> r.getHeader("User-Agent")).map(ua -> truncate(ua, MAX_USER_AGENT)).orElse(null);
    }

    private static Optional<HttpServletRequest> request() {
        RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
        return attributes instanceof ServletRequestAttributes servlet
                ? Optional.of(servlet.getRequest())
                : Optional.empty();
    }

    private static String truncate(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
