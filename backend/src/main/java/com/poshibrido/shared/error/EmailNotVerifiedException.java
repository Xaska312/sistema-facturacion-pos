package com.poshibrido.shared.error;

import java.util.Map;

/**
 * La acción exige el correo confirmado (p. ej. crear un negocio). 403 con {@code code} para que el frontend
 * ofrezca reenviar el correo.
 */
public class EmailNotVerifiedException extends ForbiddenException {

    public static final String CODE = "EMAIL_NOT_VERIFIED";

    public EmailNotVerifiedException() {
        super("Confirma tu correo para continuar. Revisa tu bandeja de entrada (y el spam) o pide un correo nuevo.");
    }

    @Override
    public Map<String, Object> getProperties() {
        return Map.of("code", CODE);
    }
}
