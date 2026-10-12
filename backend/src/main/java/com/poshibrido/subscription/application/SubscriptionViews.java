package com.poshibrido.subscription.application;

import com.poshibrido.subscription.domain.BillingCycle;
import com.poshibrido.subscription.domain.SubscriptionStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Respuestas del módulo de suscripciones. */
public final class SubscriptionViews {

    private SubscriptionViews() {
    }

    /** Límites {@code null} = sin límite; precios {@code null} = aún no definidos. */
    public record PlanView(String code, String name, Integer maxBranches, Integer maxUsers, BigDecimal monthlyPrice,
                           BigDecimal annualPrice, boolean active) {
    }

    /**
     * Suscripción de un negocio. {@code daysLeft}: días completos o parciales hasta {@code endsAt} (0 si ya pasó).
     * {@code graceEndsAt}: hasta cuándo sigue funcionando un plan pagado vencido ({@code null} en la prueba).
     * {@code payments}: vacío si quien consulta no puede ver los pagos.
     */
    public record SubscriptionView(UUID tenantId, String tradeName, PlanView plan, SubscriptionStatus status,
                                   boolean trial, BillingCycle billingCycle, Instant startedAt, Instant endsAt,
                                   Instant graceEndsAt, long daysLeft, Usage usage, String paymentInstructions,
                                   List<PaymentView> payments) {
    }

    public record Usage(long branches, long users) {
    }

    public record PaymentView(UUID id, String planCode, BillingCycle billingCycle, int periods, BigDecimal amount,
                              String method, String reference, String notes, Instant periodStart, Instant periodEnd,
                              String source, Instant createdAt) {
    }

    /** Fila de la lista de la consola de plataforma. */
    public record SubscriptionRow(UUID tenantId, String slug, String tradeName, String tenantStatus, String ownerEmail,
                                  String ownerName, String planCode, String planName, SubscriptionStatus status,
                                  boolean trial, Instant endsAt, long daysLeft) {
    }

    public enum CodeStatus {
        AVAILABLE,
        USED,
        EXPIRED,
        REVOKED
    }

    public record ActivationCodeView(UUID id, String hint, String planCode, String planName, int months, String note,
                                     CodeStatus status, Instant expiresAt, Instant createdAt, Instant usedAt,
                                     String usedTenantName) {
    }

    /** Códigos recién creados: el texto completo se muestra una sola vez. */
    public record CreatedCodes(List<String> codes, List<ActivationCodeView> details) {
    }
}
