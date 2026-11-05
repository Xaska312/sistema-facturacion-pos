package com.poshibrido.tenancy.api;

import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.subscription.application.SubscriptionApi.Entitlements;
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
    private final SubscriptionApi subscriptions;

    /**
     * El perfil con lo que permite el plan (decisión 288): {@code allowedModules}, los módulos que su plan (y sus extras)
     * incluyen; un módulo encendido fuera de esa lista no funciona hasta cambiar de plan.
     */
    public record ProfileResponse(BusinessType businessType, List<BusinessModule> modules, boolean canEdit,
                                  List<BusinessModule> allowedModules, String planName) {
    }

    public record ChangeRequest(@NotNull BusinessType businessType,
                                @NotNull @Size(max = 20) List<@NotNull BusinessModule> modules) {
    }

    @GetMapping
    public ProfileResponse get() {
        return withPlan(service.profile(CurrentTenant.require().id(), CurrentActor.requireUserId()));
    }

    /** No deja prender un módulo que el plan no incluye; uno que ya estaba encendido se puede dejar. */
    @PutMapping
    public ProfileResponse change(@Valid @RequestBody ChangeRequest request) {
        java.util.UUID tenantId = CurrentTenant.require().id();
        Entitlements plan = subscriptions.entitlements(tenantId);
        List<BusinessModule> current = service.profile(tenantId, CurrentActor.requireUserId()).modules();
        for (BusinessModule m : request.modules()) {
            if (!plan.modules().contains(m) && !current.contains(m)) {
                throw new BusinessRuleException("Ese módulo no está incluido en tu plan " + plan.planName()
                        + ". Escríbenos para pasarte a un plan que lo incluya.");
            }
        }
        return withPlan(service.change(tenantId, CurrentActor.requireUserId(), request.businessType(),
                request.modules()));
    }

    private ProfileResponse withPlan(BusinessProfile p) {
        Entitlements plan = subscriptions.entitlements(CurrentTenant.require().id());
        return new ProfileResponse(p.businessType(), p.modules(), p.canEdit(),
                plan.modules().stream().sorted().toList(), plan.planName());
    }
}
