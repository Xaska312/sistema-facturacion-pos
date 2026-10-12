package com.poshibrido.shared.error;

import java.util.Map;

/**
 * La cuenta ya usó su prueba gratis: un negocio más necesita un código de activación. 422 con {@code code} para que
 * el frontend muestre el campo del código.
 */
public class ActivationCodeRequiredException extends BusinessRuleException {

    public static final String CODE = "ACTIVATION_CODE_REQUIRED";

    public ActivationCodeRequiredException() {
        super("Ya usaste la prueba gratis en otro negocio. Para crear uno nuevo necesitas un código de activación.");
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("code", CODE);
    }
}
