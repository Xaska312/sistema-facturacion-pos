package com.poshibrido.billing.api;

import com.poshibrido.billing.application.BillingService;
import com.poshibrido.billing.application.BillingService.Catalog;
import com.poshibrido.billing.application.BillingService.Order;
import com.poshibrido.billing.application.BillingService.OrderAddon;
import com.poshibrido.billing.application.BillingService.RequestView;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.SubscriptionService;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionView;
import com.poshibrido.subscription.domain.BillingCycle;
import com.poshibrido.tenancy.application.CurrentTenant;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Planes y pagos del negocio (decisión 302): ver qué comprar, armar el pedido, subir el comprobante del pago por
 * Bre-B y empezar la prueba gratis de XASKA IA. Abierto aunque el plan esté vencido (SubscriptionGuardFilter).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/billing")
@PreAuthorize("hasAuthority('settings:manage')")
public class BillingController {

    private final BillingService billing;
    private final SubscriptionService subscriptions;

    public record OrderRequest(@Size(max = 20) String planCode, BillingCycle billingCycle, @Min(1) @Max(12) int periods,
                               @Size(max = 30) List<@Valid AddonRequest> addons) {
    }

    public record AddonRequest(@NotBlank @Size(max = 30) String code, @Min(1) @Max(20) int quantity) {
    }

    @GetMapping
    public Catalog catalog() {
        return billing.catalog(CurrentTenant.require().id());
    }

    @PostMapping("/requests")
    public RequestView create(@Valid @RequestBody OrderRequest r) {
        return billing.create(CurrentTenant.require().id(), new Order(r.planCode(), r.billingCycle(), r.periods(),
                r.addons() == null ? List.of() : r.addons().stream().map(a -> new OrderAddon(a.code(), a.quantity()))
                        .toList()), CurrentActor.requireUserId());
    }

    @DeleteMapping("/requests/{id}")
    public void cancel(@PathVariable UUID id) {
        billing.cancel(CurrentTenant.require().id(), id);
    }

    @PostMapping("/requests/{id}/proof")
    public RequestView proof(@PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return billing.uploadProof(CurrentTenant.require().id(), id, file.getBytes());
    }

    /** El QR de la llave Bre-B de XASKA (decisión 303). */
    @GetMapping("/qr")
    public org.springframework.http.ResponseEntity<byte[]> qr() {
        BillingService.Proof qr = billing.qr();
        return org.springframework.http.ResponseEntity.ok()
                .contentType(org.springframework.http.MediaType.parseMediaType(qr.contentType()))
                .header("Cache-Control", "private, max-age=300").body(qr.content());
    }

    @PostMapping("/ai-trial")
    public SubscriptionView aiTrial() {
        return subscriptions.startAiTrial(CurrentTenant.require().id());
    }
}
