package com.poshibrido.subscription.api;

import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.subscription.application.SubscriptionService.SignupTerms;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Para la pantalla "Crear negocio": si el código de activación es obligatorio (cualquier cuenta con sesión). */
@RestController
@RequiredArgsConstructor
public class SignupTermsController {

    private final SubscriptionService subscriptions;

    @GetMapping("/api/v1/tenants/signup-terms")
    public SignupTerms signupTerms() {
        return subscriptions.signupTerms();
    }
}
