package com.poshibrido.identity.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Token de un enlace recibido por correo. */
public record TokenRequest(@NotBlank @Size(max = 128) String token) {
}
