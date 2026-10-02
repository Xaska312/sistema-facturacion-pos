package com.poshibrido.identity.api;

import com.poshibrido.identity.application.AuthProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * Cookie del refresh token: HttpOnly, Secure (configurable solo para desarrollo), SameSite=Strict
 * y limitada a las rutas de autenticación.
 */
@Component
@RequiredArgsConstructor
public class RefreshCookies {

    public static final String NAME = "pos_refresh";
    public static final String PATH = "/api/v1/auth";

    private final AuthProperties properties;

    public ResponseCookie issue(String rawToken) {
        return base(rawToken).maxAge(properties.refreshTokenTtl()).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(Duration.ZERO).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(properties.refreshCookieSecure())
                .sameSite("Strict")
                .path(PATH);
    }
}
