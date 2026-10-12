package com.poshibrido.subscription.application;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * @param trialDays           días de prueba gratis del primer negocio de cada cuenta
 * @param trialPlan           plan con el que corre la prueba (sus límites)
 * @param graceDays           días que todo sigue funcionando después de vencer un periodo pagado
 * @param paymentInstructions cómo pagar (cuenta, Nequi, a quién enviar el comprobante); va en la app y en los correos
 * @param remindersEnabled    enviar los avisos diarios por correo
 */
@ConfigurationProperties(prefix = "app.subscription")
public record SubscriptionProperties(int trialDays, String trialPlan, int graceDays, String paymentInstructions,
                                     boolean remindersEnabled, boolean trialWithoutCode) {

    public SubscriptionProperties {
        trialDays = trialDays <= 0 ? 14 : trialDays;
        trialPlan = trialPlan == null || trialPlan.isBlank() ? "PRO" : trialPlan.trim();
        graceDays = Math.max(0, graceDays);
        paymentInstructions = paymentInstructions == null || paymentInstructions.isBlank()
                ? "Comunícate con soporte para renovar." : paymentInstructions.trim();
    }

    public Duration trial() {
        return Duration.ofDays(trialDays);
    }

    public Duration grace() {
        return Duration.ofDays(graceDays);
    }
}
