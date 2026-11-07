package com.poshibrido.billing.api;

import com.poshibrido.billing.application.BillingService;
import com.poshibrido.billing.application.BillingService.Pricing;
import com.poshibrido.subscription.application.SubscriptionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** Planes, adicionales y días de prueba para quien aún no entra (decisión 303). Público (SecurityConfig). */
@RestController
@RequiredArgsConstructor
public class PublicPricingController {

    private final BillingService billing;
    private final SubscriptionService subscriptions;

    @GetMapping("/api/v1/public/pricing")
    public ResponseEntity<Pricing> pricing() {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
                .body(billing.pricing(subscriptions.signupTerms().trialDays()));
    }
}
