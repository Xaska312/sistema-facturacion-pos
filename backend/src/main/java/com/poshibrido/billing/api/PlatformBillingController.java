package com.poshibrido.billing.api;

import com.poshibrido.billing.application.BillingService;
import com.poshibrido.billing.application.BillingService.AddonOption;
import com.poshibrido.billing.application.BillingService.Breb;
import com.poshibrido.billing.application.BillingService.Proof;
import com.poshibrido.billing.application.BillingService.RequestView;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Consola (decisión 302): pagos por Bre-B por revisar, datos de la llave y precios de los adicionales. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/platform/billing")
public class PlatformBillingController {

    private final BillingService billing;

    public record RejectRequest(@Size(max = 300) String reason) {
    }

    public record BrebRequest(@Size(max = 64) String key, @Size(max = 120) String holderName,
                              @Size(max = 60) String bankName, @Size(max = 300) String notes) {
    }

    public record AddonRequest(@NotBlank @Size(max = 60) String name, @Size(max = 200) String description,
                               @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal monthlyPrice,
                               @NotNull Boolean active) {
    }

    @GetMapping("/requests")
    public List<RequestView> requests(@RequestParam(required = false) String status) {
        return billing.adminList(status);
    }

    @GetMapping("/pending")
    public Map<String, Long> pending() {
        return Map.of("count", billing.pendingReviews());
    }

    @GetMapping("/requests/{id}/proof")
    public ResponseEntity<byte[]> proof(@PathVariable UUID id) {
        Proof p = billing.proof(id);
        String ext = "application/pdf".equals(p.contentType()) ? ".pdf" : ".jpg";
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(p.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"comprobante-" + p.reference() + ext + "\"")
                .header("X-Content-Type-Options", "nosniff")
                .body(p.content());
    }

    @PostMapping("/requests/{id}/approve")
    public RequestView approve(@PathVariable UUID id) {
        return billing.approve(id, CurrentActor.requireUserId());
    }

    @PostMapping("/requests/{id}/reject")
    public RequestView reject(@PathVariable UUID id, @Valid @RequestBody RejectRequest r) {
        return billing.reject(id, r.reason(), CurrentActor.requireUserId());
    }

    @GetMapping("/breb")
    public Breb breb() {
        return billing.breb();
    }

    @PutMapping("/breb")
    public Breb saveBreb(@Valid @RequestBody BrebRequest r) {
        return billing.saveBreb(r.key(), r.holderName(), r.bankName(), r.notes());
    }

    @PutMapping("/breb/qr")
    public Breb saveQr(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) throws java.io.IOException {
        return billing.saveQr(file.getBytes());
    }

    @org.springframework.web.bind.annotation.DeleteMapping("/breb/qr")
    public Breb deleteQr() {
        return billing.deleteQr();
    }

    @GetMapping("/addons")
    public List<AddonOption> addons() {
        return billing.adminAddons();
    }

    @PutMapping("/addons/{code}")
    public AddonOption updateAddon(@PathVariable String code, @Valid @RequestBody AddonRequest r) {
        return billing.updateAddon(code, r.name(), r.description(), r.monthlyPrice(), r.active());
    }
}
