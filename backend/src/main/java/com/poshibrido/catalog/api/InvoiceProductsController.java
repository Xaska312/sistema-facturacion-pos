package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.InvoiceProductsService;
import com.poshibrido.catalog.application.InvoiceProductsService.CreatedLine;
import com.poshibrido.catalog.application.InvoiceProductsService.Item;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Crear desde la factura lo que falta (decisión 301), para ponerlo de una vez en la recepción. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/products/from-invoice")
public class InvoiceProductsController {

    private final InvoiceProductsService service;

    public record CreateRequest(@NotNull @Size(min = 1, max = 200) List<Item> items) {
    }

    public record CreateResponse(List<CreatedLine> lines) {
    }

    @PostMapping
    @PreAuthorize("hasAuthority('products:manage') and hasAuthority('purchases:receive')")
    public CreateResponse create(@RequestBody @jakarta.validation.Valid CreateRequest request, Authentication auth) {
        boolean variants = auth.getAuthorities().stream().anyMatch(a -> "module:variants".equals(a.getAuthority()));
        return new CreateResponse(service.create(request.items(), variants));
    }
}
