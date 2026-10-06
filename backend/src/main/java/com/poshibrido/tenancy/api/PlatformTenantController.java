package com.poshibrido.tenancy.api;

import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.TenantAdministrationService;
import com.poshibrido.tenancy.application.TenantAdministrationService.PlatformTenantView;
import com.poshibrido.tenancy.application.TenantSummary;
import com.poshibrido.tenancy.domain.TenantStatus;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Consola de plataforma: negocios de todos los dueños, suspender y reactivar. Solo administradores de plataforma
 * (SecurityConfig: {@code /api/v1/platform/**} exige {@code PLATFORM_ADMIN}). No da acceso a los datos de cada
 * negocio: solo a su ficha en {@code platform.tenants}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/tenants")
public class PlatformTenantController {

    private final TenantAdministrationService administration;

    @GetMapping
    public PageResponse<PlatformTenantView> list(@RequestParam(required = false) String q,
                                                 @RequestParam(required = false) TenantStatus status,
                                                 @RequestParam(defaultValue = "0") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        return administration.list(q, status, page, size);
    }

    @PostMapping("/{tenantId}/suspend")
    public TenantSummary suspend(@PathVariable UUID tenantId, @Valid @RequestBody SuspendTenantRequest request) {
        return administration.suspend(tenantId, CurrentActor.requireUserId(), request.reason());
    }

    @PostMapping("/{tenantId}/reactivate")
    public TenantSummary reactivate(@PathVariable UUID tenantId) {
        return administration.reactivate(tenantId, CurrentActor.requireUserId());
    }
}
