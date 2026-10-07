package com.poshibrido.identity.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Misma regla de contraseña que el registro. */
public record PasswordResetConfirmRequest(
        @NotBlank @Size(max = 128) String token,
        @NotBlank
        @Size(min = 10, max = 128, message = "Debe tener entre 10 y 128 caracteres")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Debe contener letras y números")
        String password) {
}
