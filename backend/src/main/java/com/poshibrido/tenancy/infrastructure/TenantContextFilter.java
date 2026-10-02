package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantRef;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Optional;
import java.util.UUID;

/**
 * Asigna el {@link TenantContext} exclusivamente desde el claim {@code tid} del JWT ya validado.
 * No existe ningún header que permita al cliente elegir o sobrescribir el tenant.
 * Se registra dentro de la cadena de seguridad (no como bean de servlet) para ejecutarse una sola vez.
 */
public class TenantContextFilter extends OncePerRequestFilter {

    public static final String TENANT_CLAIM = "tid";

    private final TenantApi tenantApi;
    private final HandlerExceptionResolver exceptionResolver;

    public TenantContextFilter(TenantApi tenantApi, HandlerExceptionResolver exceptionResolver) {
        this.tenantApi = tenantApi;
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth != null && auth.getPrincipal() instanceof Jwt jwt)) {
            chain.doFilter(request, response);
            return;
        }
        MDC.put("userId", jwt.getSubject());
        try {
            String tid = jwt.getClaimAsString(TENANT_CLAIM);
            if (tid == null) {
                chain.doFilter(request, response);
                return;
            }
            Optional<TenantRef> tenant = parse(tid).flatMap(tenantApi::findActive);
            if (tenant.isEmpty()) {
                exceptionResolver.resolveException(request, response, null,
                        new ForbiddenException("El negocio no está disponible."));
                return;
            }
            TenantContext.set(tenant.get());
            MDC.put("tenant", tenant.get().slug());
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            MDC.remove("tenant");
            MDC.remove("userId");
        }
    }

    private static Optional<UUID> parse(String value) {
        try {
            return Optional.of(UUID.fromString(value));
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
    }
}
