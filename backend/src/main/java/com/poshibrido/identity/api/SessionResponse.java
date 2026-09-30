package com.poshibrido.identity.api;

import com.poshibrido.identity.application.SessionResult;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.tenancy.application.TenantSummary;

import java.util.List;
import java.util.UUID;

/**
 * Respuesta de login, selección de negocio y refresh. El refresh token NO va en el cuerpo:
 * viaja únicamente en la cookie HttpOnly.
 */
public record SessionResponse(String accessToken, String tokenType, long expiresIn, UserSummary user,
                              UUID tenantId, List<String> permissions, List<TenantSummary> tenants) {

    public static SessionResponse of(SessionResult result) {
        return new SessionResponse(result.accessToken().value(), "Bearer", result.accessToken().expiresInSeconds(),
                result.user(), result.tenantId(), result.permissions(), result.tenants());
    }
}
