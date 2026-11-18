package com.poshibrido.cash.api;

import com.poshibrido.cash.application.CashViews.OptionalPaymentMethod;
import com.poshibrido.cash.application.PaymentMethodSettings;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Medios de pago que el negocio activa en Ajustes: Addi y Sistecrédito (decisión 366). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/payment-methods/optional")
public class PaymentMethodSettingsController {

    private final PaymentMethodSettings settings;

    public record ActiveRequest(@NotNull Boolean active) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings:read')")
    public List<OptionalPaymentMethod> list() {
        return settings.optional();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('settings:manage')")
    public List<OptionalPaymentMethod> setActive(@PathVariable UUID id, @Valid @RequestBody ActiveRequest request) {
        return settings.setActive(id, request.active());
    }
}
