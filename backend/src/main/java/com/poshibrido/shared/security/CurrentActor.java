package com.poshibrido.shared.security;

import com.poshibrido.shared.error.UnauthorizedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.UUID;

/**
 * Acceso al usuario autenticado de la petición actual (claim {@code sub} del JWT).
 */
public final class CurrentActor {

    private CurrentActor() {
    }

    public static Optional<UUID> userId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            try {
                return Optional.of(UUID.fromString(jwt.getSubject()));
            } catch (IllegalArgumentException ex) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    /** Permisos ({@code recurso:acción}) del token de la petición actual. */
    public static Set<String> permissions() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return Set.of();
        }
        return auth.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(a -> a != null && a.contains(":"))
                .collect(Collectors.toUnmodifiableSet());
    }

    public static UUID requireUserId() {
        return userId().orElseThrow(() -> new UnauthorizedException("Sesión no válida."));
    }
}
