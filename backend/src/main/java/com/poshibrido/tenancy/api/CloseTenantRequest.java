package com.poshibrido.tenancy.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Confirmación para que el dueño cierre ("elimine") su negocio.
 *
 * @param confirmation el nombre comercial del negocio, escrito por el dueño
 * @param password     la contraseña del dueño
 * @param reason       motivo opcional (lo ve el administrador de plataforma)
 */
public record CloseTenantRequest(
        @NotBlank @Size(max = 200) String confirmation,
        @NotBlank @Size(max = 200) String password,
        @Size(max = 300) String reason) {
}
