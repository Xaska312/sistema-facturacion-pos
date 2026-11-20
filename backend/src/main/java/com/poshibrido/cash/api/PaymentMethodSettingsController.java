package com.poshibrido.cash.api;

import com.poshibrido.cash.application.CashViews.OptionalPaymentMethod;
import com.poshibrido.cash.application.PaymentMethodSettings;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Medios de pago que el negocio maneja en Ajustes: Addi, Sistecrédito (366) y los que agregue (367). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/payment-methods/optional")
public class PaymentMethodSettingsController {

    private final PaymentMethodSettings settings;

    public record UpdateRequest(Boolean active, @Size(max = 60) String name, Boolean requiresReference) {
    }

    public record CreateRequest(@NotBlank @Size(max = 60) String name, Boolean requiresReference) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings:read')")
    public List<OptionalPaymentMethod> list() {
        return settings.optional();
    }

    /** Agrega un medio propio del negocio (decisión 367). */
    @PostMapping
    @PreAuthorize("hasAuthority('settings:manage')")
    public List<OptionalPaymentMethod> create(@Valid @RequestBody CreateRequest request) {
        return settings.create(request.name(), request.requiresReference() == null || request.requiresReference());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('settings:manage')")
    public List<OptionalPaymentMethod> update(@PathVariable UUID id, @Valid @RequestBody UpdateRequest request) {
        return settings.update(id, request.active(), request.name(), request.requiresReference());
    }
}
