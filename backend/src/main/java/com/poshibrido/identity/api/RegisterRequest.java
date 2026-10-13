package com.poshibrido.identity.api;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank
        @Size(min = 10, max = 128, message = "Debe tener entre 10 y 128 caracteres")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Debe contener letras y números")
        String password,
        @NotBlank @Size(max = 150) String fullName,
        @Size(max = 30) String phone,
        /** Casilla "Acepto los Términos y la Política de datos" (Ley 1581): sin ella no hay registro. */
        @NotNull(message = ACCEPT_TERMS) @AssertTrue(message = ACCEPT_TERMS) Boolean acceptTerms) {

    static final String ACCEPT_TERMS = "Debes aceptar los Términos y la Política de Tratamiento de Datos.";
}
