package com.poshibrido.subscription.api;

import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.ActivationCodeService;
import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.subscription.application.SubscriptionService.PaymentCommand;
import com.poshibrido.subscription.application.SubscriptionViews.ActivationCodeView;
import com.poshibrido.subscription.application.SubscriptionViews.CreatedCodes;
import com.poshibrido.subscription.application.SubscriptionViews.PlanView;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionRow;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionView;
import com.poshibrido.subscription.domain.BillingCycle;
import com.poshibrido.subscription.domain.SubscriptionStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Consola de plataforma: planes, suscripciones de todos los negocios, pagos registrados a mano y códigos de
 * activación. Solo administradores de plataforma (SecurityConfig: {@code /api/v1/platform/**}).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform")
public class PlatformSubscriptionController {

    private final SubscriptionService subscriptions;
    private final ActivationCodeService codes;

    public record PlanRequest(@NotBlank @Size(max = 60) String name, @Min(1) Integer maxBranches,
                              @Min(1) Integer maxUsers,
                              @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal monthlyPrice,
                              @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal annualPrice,
                              @NotNull Boolean active) {
    }

    public record PaymentRequest(@NotBlank @Size(max = 20) String planCode, @NotNull BillingCycle billingCycle,
                                 @Min(1) @Max(36) int periods,
                                 @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal amount,
                                 @NotBlank @Size(max = 30) String method, @Size(max = 100) String reference,
                                 @Size(max = 500) String notes) {
    }

    public record ChangePlanRequest(@NotBlank @Size(max = 20) String planCode) {
    }

    public record CodeRequest(@NotBlank @Size(max = 20) String planCode, @Min(1) @Max(36) int months,
                              @Min(1) @Max(365) int validDays, @Size(max = 200) String note,
                              @Min(1) @Max(20) int quantity) {
    }

    // ---------------------------------------------------------------- planes

    @GetMapping("/plans")
    public List<PlanView> plans() {
        return subscriptions.plans();
    }

    @PutMapping("/plans/{code}")
    public PlanView updatePlan(@PathVariable String code, @Valid @RequestBody PlanRequest request) {
        return subscriptions.updatePlan(code, request.name(), request.maxBranches(), request.maxUsers(),
                request.monthlyPrice(), request.annualPrice(), request.active());
    }

    // ---------------------------------------------------------------- suscripciones

    @GetMapping("/subscriptions")
    public PageResponse<SubscriptionRow> list(@RequestParam(required = false) String q,
                                              @RequestParam(required = false) SubscriptionStatus status,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return subscriptions.list(q, status, page, size);
    }

    @GetMapping("/tenants/{tenantId}/subscription")
    public SubscriptionView get(@PathVariable UUID tenantId) {
        return subscriptions.view(tenantId, true);
    }

    @PostMapping("/tenants/{tenantId}/subscription/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public SubscriptionView registerPayment(@PathVariable UUID tenantId, @Valid @RequestBody PaymentRequest request) {
        return subscriptions.registerPayment(tenantId, new PaymentCommand(request.planCode(), request.billingCycle(),
                request.periods(), request.amount(), request.method(), request.reference(), request.notes()),
                CurrentActor.requireUserId());
    }

    @PutMapping("/tenants/{tenantId}/subscription/plan")
    public SubscriptionView changePlan(@PathVariable UUID tenantId, @Valid @RequestBody ChangePlanRequest request) {
        return subscriptions.changePlan(tenantId, request.planCode());
    }

    // ---------------------------------------------------------------- códigos de activación

    @GetMapping("/activation-codes")
    public List<ActivationCodeView> codes() {
        return codes.list();
    }

    @PostMapping("/activation-codes")
    @ResponseStatus(HttpStatus.CREATED)
    public CreatedCodes createCodes(@Valid @RequestBody CodeRequest request) {
        return codes.create(request.planCode(), request.months(), request.validDays(), request.note(),
                request.quantity(), CurrentActor.requireUserId());
    }

    @PostMapping("/activation-codes/{id}/revoke")
    public ActivationCodeView revoke(@PathVariable UUID id) {
        return codes.revoke(id);
    }
}
