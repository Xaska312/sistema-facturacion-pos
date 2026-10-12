package com.poshibrido.subscription.api;

import com.poshibrido.config.RequestPaths;
import com.poshibrido.shared.error.SubscriptionExpiredException;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Con la suscripción vencida, el negocio queda en <b>solo consulta</b>: se puede ver y exportar todo (GET), pero no
 * registrar ventas ni cambios (403 {@code SUBSCRIPTION_EXPIRED}). Se permite cerrar la caja abierta (el efectivo del
 * día debe poder cuadrarse) y todo lo que no es del negocio aunque viaje con su token: sesión, crear otro negocio (p.
 * ej. con un código), aceptar invitaciones y la consola de plataforma. Va después de {@code TenantContextFilter}.
 */
public class SubscriptionGuardFilter extends OncePerRequestFilter {

    private static final Set<String> READ_METHODS = Set.of("GET", "HEAD", "OPTIONS");
    private static final Pattern ALLOWED = Pattern.compile(
            "^/api/v1/(auth/.*|tenants(/.*)?|invitations/.*|platform/.*|cash/sessions/[^/]+/close)$");

    private final SubscriptionApi subscriptions;
    private final HandlerExceptionResolver exceptionResolver;

    public SubscriptionGuardFilter(SubscriptionApi subscriptions, HandlerExceptionResolver exceptionResolver) {
        this.subscriptions = subscriptions;
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<TenantRef> tenant = TenantContext.current();
        if (tenant.isPresent() && !READ_METHODS.contains(request.getMethod())
                && !ALLOWED.matcher(RequestPaths.normalized(request)).matches()
                && subscriptions.blocksWrites(tenant.get().id())) {
            exceptionResolver.resolveException(request, response, null, new SubscriptionExpiredException());
            return;
        }
        chain.doFilter(request, response);
    }
}
