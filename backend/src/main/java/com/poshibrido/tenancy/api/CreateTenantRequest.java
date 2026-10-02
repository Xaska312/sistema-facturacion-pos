package com.poshibrido.tenancy.api;

import com.poshibrido.tenancy.domain.BusinessType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateTenantRequest(
        @NotBlank
        @Pattern(regexp = "^[a-z][a-z0-9_]{2,40}$",
                message = "Debe iniciar con letra y contener solo minúsculas, números o '_' (3 a 41 caracteres)")
        String slug,
        @NotBlank @Size(max = 200) String legalName,
        @NotBlank @Size(max = 200) String tradeName,
        @NotNull BusinessType businessType) {
}
