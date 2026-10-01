package com.poshibrido.tenancy.application;

import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.tenancy.infrastructure.TenantContext;

/**
 * Negocio de la petición actual (tomado del claim {@code tid} del token).
 */
public final class CurrentTenant {

    private CurrentTenant() {
    }

    public static TenantRef require() {
        return TenantContext.current()
                .orElseThrow(() -> new ForbiddenException("Esta operación requiere seleccionar un negocio."));
    }
}
