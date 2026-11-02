package com.poshibrido.config;

import com.poshibrido.access.application.ActiveMembers;
import com.poshibrido.shared.error.UnauthorizedException;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

/**
 * Con un token de negocio, la persona debe seguir activa en ese negocio (decisión 277): a quien desactivan le deja de
 * servir la sesión abierta de inmediato, sin esperar a que venza el token de acceso (15 min). Responde 401: la app
 * intenta renovar la sesión, la renovación ya fue revocada al desactivarlo y vuelve al login.
 * Va después de {@code TenantContextFilter} (necesita el negocio resuelto).
 */
public class ActiveMemberFilter extends OncePerRequestFilter {

    static final String DEACTIVATED = "Tu acceso a este negocio fue desactivado. Habla con el administrador.";

    private final ActiveMembers activeMembers;
    private final HandlerExceptionResolver exceptionResolver;

    public ActiveMemberFilter(ActiveMembers activeMembers, HandlerExceptionResolver exceptionResolver) {
        this.activeMembers = activeMembers;
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<TenantRef> tenant = TenantContext.current();
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (tenant.isPresent() && auth != null && auth.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            UUID userId;
            try {
                userId = UUID.fromString(jwt.getSubject());
            } catch (IllegalArgumentException ex) {
                exceptionResolver.resolveException(request, response, null, new UnauthorizedException(DEACTIVATED));
                return;
            }
            if (!activeMembers.isActive(tenant.get().id(), userId)) {
                exceptionResolver.resolveException(request, response, null, new UnauthorizedException(DEACTIVATED));
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
