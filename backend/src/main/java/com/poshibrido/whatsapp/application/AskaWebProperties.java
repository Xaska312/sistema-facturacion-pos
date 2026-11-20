package com.poshibrido.whatsapp.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Chat de Aska en xaska.co (decisión 364).
 *
 * @param allowedOrigins páginas que pueden usar el chat desde el navegador ({@code ASKA_WEB_ORIGINS})
 * @param dailyReplies   tope de respuestas de Aska en todo el chat web en 24 horas; al pasarlo, invita a WhatsApp
 * @param perIp          mensajes por IP cada 10 minutos
 */
@ConfigurationProperties(prefix = "app.aska-web")
public record AskaWebProperties(List<String> allowedOrigins, Integer dailyReplies, Integer perIp) {

    public List<String> origins() {
        return allowedOrigins == null ? List.of() : allowedOrigins.stream().filter(o -> o != null && !o.isBlank())
                .map(String::strip).toList();
    }

    public int daily() {
        return dailyReplies == null ? 300 : dailyReplies;
    }

    public int ipLimit() {
        return perIp == null ? 20 : perIp;
    }
}
