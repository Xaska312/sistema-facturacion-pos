package com.poshibrido.identity.application;

import com.poshibrido.tenancy.application.TenantSummary;

import java.util.List;
import java.util.UUID;

/**
 * Resultado de un inicio o renovación de sesión. {@code refreshToken} viaja solo en cookie HttpOnly.
 *
 * @param tenantId    negocio de la sesión, o {@code null} si es sesión de plataforma
 * @param tenants     negocios visibles para el usuario (solo en login)
 */
public record SessionResult(IssuedToken accessToken, String refreshToken, UserSummary user, UUID tenantId,
                            List<String> permissions, List<TenantSummary> tenants) {
}
