package com.poshibrido.tenancy.api;

import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.BusinessProfileService;
import com.poshibrido.tenancy.application.BusinessProfileService.BusinessProfile;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.BusinessType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Tipo de negocio y módulos del negocio de la sesión (Fase 12a, decisión 267). Cualquier miembro los consulta; solo
 * el dueño los cambia (lo revisa el servicio). Después de cambiarlos, la app renueva la sesión para tomar los
 * permisos nuevos.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/business-profile")
public class BusinessProfileController {

    private final BusinessProfileService service;

    public record ChangeRequest(@NotNull BusinessType businessType,
                                @NotNull @Size(max = 20) List<@NotNull BusinessModule> modules) {
    }

    @GetMapping
    public BusinessProfile get() {
        return service.profile(CurrentTenant.require().id(), CurrentActor.requireUserId());
    }

    @PutMapping
    public BusinessProfile change(@Valid @RequestBody ChangeRequest request) {
        return service.change(CurrentTenant.require().id(), CurrentActor.requireUserId(), request.businessType(),
                request.modules());
    }
}
