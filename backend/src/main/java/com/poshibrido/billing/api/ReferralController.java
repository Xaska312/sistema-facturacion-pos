package com.poshibrido.billing.api;

import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.subscription.application.ReferralService;
import com.poshibrido.subscription.application.ReferralService.Mine;
import com.poshibrido.subscription.application.ReferralService.Partner;
import com.poshibrido.subscription.application.ReferralService.PartnerInput;
import com.poshibrido.subscription.application.ReferralService.Row;
import com.poshibrido.tenancy.application.CurrentTenant;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Referidos y aliados (decisión 312): "Invita y gana" del dueño ({@code settings:manage}) y, en la Consola, los
 * aliados (contadores y distribuidores) y los negocios referidos con sus comisiones.
 */
@RestController
@RequiredArgsConstructor
public class ReferralController {

    private final ReferralService referrals;

    public record PartnerRequest(@NotBlank @Size(max = 120) String name, @NotBlank String kind,
                                 @Size(max = 30) String phone, @Size(max = 160) String email,
                                 @Size(max = 64) String payoutKey, @Size(max = 300) String note,
                                 @NotNull Boolean active) {
        PartnerInput input() {
            return new PartnerInput(name, kind, phone, email, payoutKey, note, active);
        }
    }

    public record PaidRequest(@NotBlank @Size(max = 60) String reference) {
    }

    @GetMapping("/api/v1/billing/referrals")
    @PreAuthorize("hasAuthority('settings:manage')")
    public Mine mine() {
        return referrals.mine(CurrentTenant.require().id());
    }

    @GetMapping("/api/v1/platform/partners")
    public List<Partner> partners() {
        return referrals.partners();
    }

    @PostMapping("/api/v1/platform/partners")
    public Partner create(@Valid @RequestBody PartnerRequest r) {
        return referrals.savePartner(null, r.input(), CurrentActor.requireUserId());
    }

    @PutMapping("/api/v1/platform/partners/{id}")
    public Partner update(@PathVariable UUID id, @Valid @RequestBody PartnerRequest r) {
        return referrals.savePartner(id, r.input(), CurrentActor.requireUserId());
    }

    @GetMapping("/api/v1/platform/referrals")
    public List<Row> list() {
        return referrals.referrals();
    }

    @PostMapping("/api/v1/platform/referrals/{tenantId}/paid")
    public Row paid(@PathVariable UUID tenantId, @Valid @RequestBody PaidRequest r) {
        return referrals.markPaid(tenantId, r.reference(), CurrentActor.requireUserId());
    }
}
