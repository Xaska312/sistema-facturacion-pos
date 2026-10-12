package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.ProductModelService;
import com.poshibrido.catalog.application.ProductModelService.ModelCommand;
import com.poshibrido.catalog.application.ProductModelService.ModelRow;
import com.poshibrido.catalog.application.ProductModelService.ModelView;
import com.poshibrido.catalog.application.SizeScaleService;
import com.poshibrido.catalog.application.SizeScaleService.Size;
import com.poshibrido.catalog.application.SizeScaleService.SizeScaleView;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Tallas y colores (fase 8d): escalas de tallas y modelos con variantes. Leer: {@code products:read}; crear y
 * editar: {@code products:manage}. Las variantes se venden, se cuentan y se trasladan como cualquier producto.
 */
@RestController
@RequiredArgsConstructor
public class ProductModelController {

    private static final Set<String> SORTABLE = Set.of("name", "skuPrefix", "createdAt");

    private final ProductModelService models;
    private final SizeScaleService scales;

    // ---------------------------------------------------------------- DTOs

    public record SizeRequest(@NotBlank @jakarta.validation.constraints.Size(max = 10) String label,
                              @jakarta.validation.constraints.Size(max = 40) String equivalent) {
    }

    public record ScaleRequest(@NotBlank @jakarta.validation.constraints.Size(max = 60) String name, Boolean active,
                               @NotEmpty @jakarta.validation.constraints.Size(max = 40) List<@Valid SizeRequest> sizes) {

        List<Size> toSizes() {
            return sizes.stream().map(s -> new Size(s.label(), s.equivalent())).toList();
        }
    }

    public record ModelRequest(
            @NotBlank @jakarta.validation.constraints.Size(max = 20) String skuPrefix,
            @NotBlank @jakarta.validation.constraints.Size(max = 140) String name,
            @jakarta.validation.constraints.Size(max = 500) String description,
            UUID categoryId,
            @NotNull UUID taxId,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal cost,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal salePrice,
            @NotNull UUID sizeScaleId,
            @NotEmpty @jakarta.validation.constraints.Size(max = 40) List<String> sizes,
            @jakarta.validation.constraints.Size(max = 20) List<String> colors) {

        ModelCommand toCommand() {
            return new ModelCommand(skuPrefix, name, description, categoryId, taxId, cost, salePrice, sizeScaleId,
                    sizes, colors);
        }
    }

    /** Edición del modelo: el prefijo, la escala y las variantes no cambian aquí. */
    public record ModelUpdateRequest(
            @NotBlank @jakarta.validation.constraints.Size(max = 140) String name,
            @jakarta.validation.constraints.Size(max = 500) String description,
            UUID categoryId,
            @NotNull UUID taxId,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal cost,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal salePrice) {

        ModelCommand toCommand() {
            return new ModelCommand(null, name, description, categoryId, taxId, cost, salePrice, null, null, null);
        }
    }

    public record VariantsRequest(@NotEmpty @jakarta.validation.constraints.Size(max = 40) List<String> sizes,
                                  @jakarta.validation.constraints.Size(max = 20) List<String> colors) {
    }

    /** {@code barcode} o {@code active} nulos = no cambian. */
    public record VariantRequest(@jakarta.validation.constraints.Size(max = 48) String barcode, Boolean active) {
    }

    // ---------------------------------------------------------------- escalas

    @GetMapping("/api/v1/size-scales")
    @PreAuthorize("hasAuthority('products:read')")
    public List<SizeScaleView> scales() {
        return scales.list();
    }

    @PostMapping("/api/v1/size-scales")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public SizeScaleView createScale(@Valid @RequestBody ScaleRequest request) {
        return scales.create(request.name(), request.toSizes());
    }

    @PutMapping("/api/v1/size-scales/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public SizeScaleView updateScale(@PathVariable UUID id, @Valid @RequestBody ScaleRequest request) {
        return scales.update(id, request.name(), request.active() == null || request.active(), request.toSizes());
    }

    // ---------------------------------------------------------------- modelos

    @GetMapping("/api/v1/product-models")
    @PreAuthorize("hasAuthority('products:read')")
    public PageResponse<ModelRow> search(@RequestParam(required = false) String search,
                                         @RequestParam(defaultValue = "false") boolean includeInactive,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "20") int size,
                                         @RequestParam(required = false) String sort) {
        return PageResponse.of(models.search(search, includeInactive,
                PageRequests.of(page, size, sort, SORTABLE, Sort.by("name"))), r -> r);
    }

    @GetMapping("/api/v1/product-models/{id}")
    @PreAuthorize("hasAuthority('products:read')")
    public ModelView get(@PathVariable UUID id) {
        return models.get(id);
    }

    @PostMapping("/api/v1/product-models")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView create(@Valid @RequestBody ModelRequest request) {
        return models.create(request.toCommand());
    }

    @PutMapping("/api/v1/product-models/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView update(@PathVariable UUID id, @Valid @RequestBody ModelUpdateRequest request) {
        return models.update(id, request.toCommand());
    }

    @PostMapping("/api/v1/product-models/{id}/variants")
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView addVariants(@PathVariable UUID id, @Valid @RequestBody VariantsRequest request) {
        return models.addVariants(id, request.sizes(), request.colors());
    }

    @PutMapping("/api/v1/product-models/{id}/variants/{productId}")
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView updateVariant(@PathVariable UUID id, @PathVariable UUID productId,
                                   @Valid @RequestBody VariantRequest request) {
        return models.updateVariant(id, productId, request.barcode(), request.active());
    }

    @PostMapping("/api/v1/product-models/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView activate(@PathVariable UUID id) {
        return models.setActive(id, true);
    }

    @PostMapping("/api/v1/product-models/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public ModelView deactivate(@PathVariable UUID id) {
        return models.setActive(id, false);
    }
}
