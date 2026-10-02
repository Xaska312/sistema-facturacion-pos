package com.poshibrido.tenancy.api;

import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CreateTenantCommand;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantProvisioningService;
import com.poshibrido.tenancy.application.TenantSummary;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Endpoints de plataforma: aceptan token de plataforma o de negocio. Toda operación usa
 * el usuario del token y verifica pertenencia del recurso (autorización a nivel de objeto).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/tenants")
public class TenantController {

    private final TenantApi tenantApi;
    private final TenantProvisioningService provisioning;

    @GetMapping
    public List<TenantSummary> myTenants() {
        return tenantApi.listVisibleTo(CurrentActor.requireUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TenantSummary create(@Valid @RequestBody CreateTenantRequest request) {
        return provisioning.create(CurrentActor.requireUserId(), new CreateTenantCommand(
                request.slug(), request.legalName(), request.tradeName(), request.businessType()));
    }

    @PostMapping("/{tenantId}/retry-provisioning")
    public TenantSummary retry(@PathVariable UUID tenantId) {
        return provisioning.retry(CurrentActor.requireUserId(), tenantId);
    }
}
