package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.CatalogConfigService;
import com.poshibrido.catalog.domain.Category;
import com.poshibrido.catalog.domain.PriceList;
import com.poshibrido.catalog.domain.Tax;
import com.poshibrido.catalog.domain.TaxType;
import com.poshibrido.catalog.domain.Unit;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** Categorías, unidades, impuestos y listas de precios. Leer: products:read; modificar: products:manage. */
@RestController
@RequiredArgsConstructor
public class CatalogConfigController {

    private final CatalogConfigService service;

    // ---------------------------------------------------------------- DTOs

    public record CategoryResponse(UUID id, UUID parentId, String name, boolean active) {
        static CategoryResponse of(Category c) {
            return new CategoryResponse(c.getId(), c.getParentId(), c.getName(), c.isActive());
        }
    }

    public record CategoryRequest(@NotBlank @Size(max = 120) String name, UUID parentId) {
    }

    public record UnitResponse(UUID id, String code, String name, boolean allowsDecimals, boolean active) {
        static UnitResponse of(Unit u) {
            return new UnitResponse(u.getId(), u.getCode(), u.getName(), u.isAllowsDecimals(), u.isActive());
        }
    }

    public record CreateUnitRequest(@NotBlank @Size(max = 10) String code, @NotBlank @Size(max = 60) String name,
                                    Boolean allowsDecimals) {
    }

    public record UpdateUnitRequest(@NotBlank @Size(max = 60) String name, Boolean allowsDecimals) {
    }

    public record TaxResponse(UUID id, String code, String name, TaxType type, BigDecimal rate, boolean active) {
        static TaxResponse of(Tax t) {
            return new TaxResponse(t.getId(), t.getCode(), t.getName(), t.getType(), t.getRate(), t.isActive());
        }
    }

    public record CreateTaxRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 60) String name,
                                   @NotNull TaxType type,
                                   @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal rate) {
    }

    public record UpdateTaxRequest(@NotBlank @Size(max = 60) String name,
                                   @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal rate) {
    }

    public record PriceListResponse(UUID id, String code, String name, boolean defaultList, boolean active) {
        static PriceListResponse of(PriceList p) {
            return new PriceListResponse(p.getId(), p.getCode(), p.getName(), p.isDefaultList(), p.isActive());
        }
    }

    public record CreatePriceListRequest(@NotBlank @Size(max = 20) String code, @NotBlank @Size(max = 80) String name) {
    }

    public record RenameRequest(@NotBlank @Size(max = 80) String name) {
    }

    // ---------------------------------------------------------------- Categorías

    @GetMapping("/api/v1/categories")
    @PreAuthorize("hasAuthority('products:read')")
    public List<CategoryResponse> categories() {
        return service.categories().stream().map(CategoryResponse::of).toList();
    }

    @PostMapping("/api/v1/categories")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public CategoryResponse createCategory(@Valid @RequestBody CategoryRequest request) {
        return CategoryResponse.of(service.createCategory(request.name(), request.parentId()));
    }

    @PutMapping("/api/v1/categories/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public CategoryResponse updateCategory(@PathVariable UUID id, @Valid @RequestBody CategoryRequest request) {
        return CategoryResponse.of(service.updateCategory(id, request.name(), request.parentId()));
    }

    @PostMapping("/api/v1/categories/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public CategoryResponse activateCategory(@PathVariable UUID id) {
        return CategoryResponse.of(service.setCategoryActive(id, true));
    }

    @PostMapping("/api/v1/categories/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public CategoryResponse deactivateCategory(@PathVariable UUID id) {
        return CategoryResponse.of(service.setCategoryActive(id, false));
    }

    // ---------------------------------------------------------------- Unidades

    @GetMapping("/api/v1/units")
    @PreAuthorize("hasAuthority('products:read')")
    public List<UnitResponse> units() {
        return service.units().stream().map(UnitResponse::of).toList();
    }

    @PostMapping("/api/v1/units")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public UnitResponse createUnit(@Valid @RequestBody CreateUnitRequest request) {
        return UnitResponse.of(service.createUnit(request.code(), request.name(), Boolean.TRUE.equals(request.allowsDecimals())));
    }

    @PutMapping("/api/v1/units/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public UnitResponse updateUnit(@PathVariable UUID id, @Valid @RequestBody UpdateUnitRequest request) {
        return UnitResponse.of(service.updateUnit(id, request.name(), Boolean.TRUE.equals(request.allowsDecimals())));
    }

    @PostMapping("/api/v1/units/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public UnitResponse activateUnit(@PathVariable UUID id) {
        return UnitResponse.of(service.setUnitActive(id, true));
    }

    @PostMapping("/api/v1/units/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public UnitResponse deactivateUnit(@PathVariable UUID id) {
        return UnitResponse.of(service.setUnitActive(id, false));
    }

    // ---------------------------------------------------------------- Impuestos

    @GetMapping("/api/v1/taxes")
    @PreAuthorize("hasAuthority('products:read')")
    public List<TaxResponse> taxes() {
        return service.taxes().stream().map(TaxResponse::of).toList();
    }

    @PostMapping("/api/v1/taxes")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public TaxResponse createTax(@Valid @RequestBody CreateTaxRequest request) {
        return TaxResponse.of(service.createTax(request.code(), request.name(), request.type(), request.rate()));
    }

    @PutMapping("/api/v1/taxes/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public TaxResponse updateTax(@PathVariable UUID id, @Valid @RequestBody UpdateTaxRequest request) {
        return TaxResponse.of(service.updateTax(id, request.name(), request.rate()));
    }

    @PostMapping("/api/v1/taxes/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public TaxResponse activateTax(@PathVariable UUID id) {
        return TaxResponse.of(service.setTaxActive(id, true));
    }

    @PostMapping("/api/v1/taxes/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public TaxResponse deactivateTax(@PathVariable UUID id) {
        return TaxResponse.of(service.setTaxActive(id, false));
    }

    // ---------------------------------------------------------------- Listas de precios

    @GetMapping("/api/v1/price-lists")
    @PreAuthorize("hasAnyAuthority('products:read', 'parties:read')")
    public List<PriceListResponse> priceLists() {
        return service.priceLists().stream().map(PriceListResponse::of).toList();
    }

    @PostMapping("/api/v1/price-lists")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public PriceListResponse createPriceList(@Valid @RequestBody CreatePriceListRequest request) {
        return PriceListResponse.of(service.createPriceList(request.code(), request.name()));
    }

    @PutMapping("/api/v1/price-lists/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public PriceListResponse renamePriceList(@PathVariable UUID id, @Valid @RequestBody RenameRequest request) {
        return PriceListResponse.of(service.renamePriceList(id, request.name()));
    }

    @PostMapping("/api/v1/price-lists/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public PriceListResponse activatePriceList(@PathVariable UUID id) {
        return PriceListResponse.of(service.setPriceListActive(id, true));
    }

    @PostMapping("/api/v1/price-lists/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public PriceListResponse deactivatePriceList(@PathVariable UUID id) {
        return PriceListResponse.of(service.setPriceListActive(id, false));
    }
}
