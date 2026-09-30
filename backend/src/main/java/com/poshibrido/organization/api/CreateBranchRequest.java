package com.poshibrido.organization.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateBranchRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{2,20}$", message = "Solo letras, números, '_' o '-' (2 a 20)")
        String code,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 255) String address,
        @Pattern(regexp = "^\\d{5}$", message = "Código DIVIPOLA de 5 dígitos") String cityCode,
        @Size(max = 30) String phone) {
}
