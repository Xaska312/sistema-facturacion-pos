package com.poshibrido.access.api;

import com.poshibrido.access.application.InvitationAcceptanceService;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lado del invitado. El token viaja en el cuerpo (no en la URL de la API) para que no quede en logs.
 * {@code preview} es público; {@code accept} requiere sesión (token de plataforma o de negocio).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/invitations")
public class PublicInvitationController {

    private final InvitationAcceptanceService service;

    public record TokenRequest(@NotBlank @Size(max = 128) String token) {
    }

    @PostMapping("/preview")
    public InvitationAcceptanceService.Preview preview(@Valid @RequestBody TokenRequest request) {
        return service.preview(request.token());
    }

    @PostMapping("/accept")
    public InvitationAcceptanceService.Accepted accept(@Valid @RequestBody TokenRequest request) {
        return service.accept(request.token(), CurrentActor.requireUserId());
    }
}
