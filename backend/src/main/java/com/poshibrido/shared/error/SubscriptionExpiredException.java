package com.poshibrido.shared.error;

import java.util.Map;

/**
 * La suscripción del negocio venció: se puede consultar todo, pero no registrar ventas ni cambios. 403 con
 * {@code code} para que el frontend muestre cómo renovar.
 */
public class SubscriptionExpiredException extends ForbiddenException {

    public static final String CODE = "SUBSCRIPTION_EXPIRED";

    public SubscriptionExpiredException() {
        super("La suscripción de este negocio venció. Puedes consultar tu información, pero no registrar ventas ni "
                + "cambios hasta renovarla.");
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("code", CODE);
    }
}
