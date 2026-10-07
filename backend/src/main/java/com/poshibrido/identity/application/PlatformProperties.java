package com.poshibrido.identity.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * @param adminEmails correos de los administradores de plataforma ({@code PLATFORM_ADMIN_EMAILS}, separados por
 *                    coma). Quien inicia sesión con uno de ellos recibe {@code padm} en su token.
 */
@ConfigurationProperties(prefix = "app.platform")
public record PlatformProperties(List<String> adminEmails) {
}
