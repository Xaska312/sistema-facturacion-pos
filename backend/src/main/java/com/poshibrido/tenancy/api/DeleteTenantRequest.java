package com.poshibrido.tenancy.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Confirmación para que el administrador de plataforma elimine definitivamente un negocio suspendido (decisión 262).
 *
 * @param confirmation el nombre comercial del negocio, escrito por el administrador
 * @param password     la contraseña del administrador
 * @param reason       motivo (queda en los eventos de seguridad y en la ficha del negocio)
 */
public record DeleteTenantRequest(
        @NotBlank @Size(max = 200) String confirmation,
        @NotBlank @Size(max = 200) String password,
        @NotBlank @Size(max = 300) String reason) {
}
