package com.poshibrido.shared.error;

import java.util.Map;

/**
 * El negocio del token ya no está activo (suspendido o cerrado por su dueño). 403 con {@code code} para que el
 * frontend saque al usuario del negocio en vez de mostrar el error en cada pantalla.
 */
public class TenantUnavailableException extends ForbiddenException {

    public static final String CODE = "TENANT_UNAVAILABLE";

    public TenantUnavailableException() {
        super("El negocio no está disponible.");
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("code", CODE);
    }
}
