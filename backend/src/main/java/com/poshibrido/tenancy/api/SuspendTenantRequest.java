package com.poshibrido.tenancy.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** @param reason motivo de la suspensión; lo verán los miembros del negocio al iniciar sesión */
public record SuspendTenantRequest(@NotBlank @Size(max = 300) String reason) {
}
