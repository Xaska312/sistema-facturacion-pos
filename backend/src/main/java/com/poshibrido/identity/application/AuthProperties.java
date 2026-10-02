package com.poshibrido.identity.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.security")
public record AuthProperties(
        String jwtSecret,
        String issuer,
        Duration accessTokenTtl,
        Duration refreshTokenTtl,
        boolean refreshCookieSecure,
        int maxFailedAttempts,
        Duration lockDuration) {
}
