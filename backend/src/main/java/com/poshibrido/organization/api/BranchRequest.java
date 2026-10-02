package com.poshibrido.organization.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Datos editables de una sucursal (el código no cambia después de crearla). */
public record BranchRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 255) String address,
        @Pattern(regexp = "^\\d{5}$", message = "Código DIVIPOLA de 5 dígitos") String cityCode,
        @Size(max = 30) String phone) {
}
