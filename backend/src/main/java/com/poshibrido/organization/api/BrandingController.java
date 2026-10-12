package com.poshibrido.organization.api;

import com.poshibrido.organization.application.BrandingService;
import com.poshibrido.organization.application.BrandingService.Branding;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Marca del negocio (fase 8c). Leerla: cualquier miembro (encabezado, POS y tiquete; las rutas /api/v1 ya exigen una
 * sesión del negocio). Cambiarla: {@code settings:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/branding")
public class BrandingController {

    private final BrandingService service;

    public record ColorRequest(@NotBlank @Size(max = 20) String color) {
    }

    /** Data URL de la imagen ya reducida por el navegador (150 KB en base64 ≈ 205.000 caracteres). */
    public record LogoRequest(@NotBlank @Size(max = 210_000) String dataUrl) {
    }

    @GetMapping
    public Branding get() {
        return service.current();
    }

    @PutMapping("/color")
    @PreAuthorize("hasAuthority('settings:manage')")
    public Branding color(@Valid @RequestBody ColorRequest request) {
        return service.setColor(request.color());
    }

    @PutMapping("/logo")
    @PreAuthorize("hasAuthority('settings:manage')")
    public Branding logo(@Valid @RequestBody LogoRequest request) {
        return service.setLogo(request.dataUrl());
    }

    @DeleteMapping("/logo")
    @PreAuthorize("hasAuthority('settings:manage')")
    public Branding removeLogo() {
        return service.removeLogo();
    }
}
