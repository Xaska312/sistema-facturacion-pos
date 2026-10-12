package com.poshibrido.subscription.api;

import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionView;
import com.poshibrido.tenancy.application.CurrentTenant;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Suscripción del negocio actual: cualquier miembro ve el plan, el estado y la fecha de fin (para el aviso en
 * pantalla); los pagos, solo quien puede cambiar los ajustes del negocio ({@code settings:manage}).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/subscription")
public class SubscriptionController {

    private final SubscriptionService subscriptions;

    @GetMapping
    public SubscriptionView current() {
        return subscriptions.viewForTenant(CurrentTenant.require().id(),
                CurrentActor.permissions().contains("settings:manage"));
    }
}
