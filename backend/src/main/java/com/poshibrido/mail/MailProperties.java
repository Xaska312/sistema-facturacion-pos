package com.poshibrido.mail;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param from         remitente, p. ej. {@code POS Híbrido <no-responder@midominio.com>}
 * @param resendApiKey clave de Resend; vacía = no se usa Resend
 * @param publicUrl    dirección pública de la app (sin "/" final) para armar los enlaces
 * @param async        enviar en segundo plano (los tests lo apagan para leer el correo en la misma petición)
 */
@ConfigurationProperties(prefix = "app.mail")
public record MailProperties(String from, String resendApiKey, String publicUrl, boolean async) {

    public boolean resendEnabled() {
        return resendApiKey != null && !resendApiKey.isBlank();
    }

    /** {@code publicUrl} + ruta, sin "/" repetida. */
    public String link(String path) {
        String base = publicUrl == null || publicUrl.isBlank() ? "http://localhost:4200" : publicUrl.trim();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + (path.startsWith("/") ? path : "/" + path);
    }
}
