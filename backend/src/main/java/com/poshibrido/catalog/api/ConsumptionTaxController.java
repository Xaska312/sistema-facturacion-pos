package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.ConsumptionTaxService;
import com.poshibrido.catalog.application.ConsumptionTaxService.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Asistente del impuesto al consumo del 8 % (Fase 12b-5): lo crea si falta y lo asigna a categorías completas. */
@RestController
@RequiredArgsConstructor
public class ConsumptionTaxController {

    private final ConsumptionTaxService service;

    public record ApplyRequest(@NotEmpty @Size(max = 100) List<@NotNull UUID> categoryIds) {
    }

    @PostMapping("/api/v1/taxes/consumption")
    @PreAuthorize("hasAuthority('settings:manage') and hasAuthority('products:manage')")
    public Result apply(@Valid @RequestBody ApplyRequest request) {
        return service.apply(request.categoryIds());
    }
}
