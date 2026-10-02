package com.poshibrido.identity.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank
        @Size(min = 10, max = 128, message = "Debe tener entre 10 y 128 caracteres")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$", message = "Debe contener letras y números")
        String password,
        @NotBlank @Size(max = 150) String fullName,
        @Size(max = 30) String phone) {
}
