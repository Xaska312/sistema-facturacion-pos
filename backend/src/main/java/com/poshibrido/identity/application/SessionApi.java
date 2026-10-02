package com.poshibrido.identity.application;

import java.util.UUID;

/**
 * Control de sesiones para otros módulos (p. ej. al desactivar un miembro).
 */
public interface SessionApi {

    /**
     * Revoca los refresh tokens del usuario en ese negocio: deja de poder renovar su sesión.
     * Su access token vigente expira solo (TTL corto). Debe ejecutarse dentro de una transacción.
     */
    void revokeTenantSessions(UUID userId, UUID tenantId);
}
