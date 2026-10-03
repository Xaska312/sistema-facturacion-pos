package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.catalog.application.ProductCommand;
import com.poshibrido.catalog.application.ProductImportService;
import com.poshibrido.catalog.application.ProductLookupService;
import com.poshibrido.catalog.application.ProductService;
import com.poshibrido.catalog.application.ProductView;
import com.poshibrido.shared.api.PageRequests;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class ProductController {

    private static final Set<String> SORTABLE = Set.of("name", "sku", "salePrice", "createdAt");
    private static final long MAX_IMPORT_BYTES = 5L * 1024 * 1024;

    private final ProductService products;
    private final ProductLookupService lookup;
    private final ProductImportService importer;

    public record ConversionRequest(@NotNull UUID unitId,
                                    @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 10, fraction = 4) BigDecimal factor,
                                    @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal salePrice) {
    }

    public record BarcodeRequest(@NotBlank @Size(max = 48) String barcode, UUID unitId, Boolean internal) {
    }

    public record ListPriceRequest(@NotNull UUID priceListId, UUID unitId,
                                   @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal price) {
    }

    public record ProductRequest(
            @NotBlank @Size(max = 40) String sku,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 500) String description,
            UUID categoryId,
            @NotNull UUID baseUnitId,
            @NotNull UUID taxId,
            @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal cost,
            @NotNull @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal salePrice,
            Boolean trackInventory,
            @Size(max = 20) List<@Valid ConversionRequest> conversions,
            @Size(max = 50) List<@Valid BarcodeRequest> barcodes,
            @Size(max = 200) List<@Valid ListPriceRequest> listPrices) {

        ProductCommand toCommand() {
            return new ProductCommand(sku, name, description, categoryId, baseUnitId, taxId, cost, salePrice,
                    trackInventory == null || trackInventory,
                    conversions == null ? List.of() : conversions.stream()
                            .map(c -> new ProductCommand.Conversion(c.unitId(), c.factor(), c.salePrice())).toList(),
                    barcodes == null ? List.of() : barcodes.stream()
                            .map(b -> new ProductCommand.Barcode(b.barcode(), b.unitId(), Boolean.TRUE.equals(b.internal()))).toList(),
                    listPrices == null ? List.of() : listPrices.stream()
                            .map(p -> new ProductCommand.ListPrice(p.priceListId(), p.unitId(), p.price())).toList());
        }
    }

    @GetMapping("/api/v1/products")
    @PreAuthorize("hasAuthority('products:read')")
    public PageResponse<ProductView> search(@RequestParam(required = false) String search,
                                            @RequestParam(required = false) UUID categoryId,
                                            @RequestParam(defaultValue = "false") boolean includeInactive,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "20") int size,
                                            @RequestParam(required = false) String sort) {
        return PageResponse.of(products.search(search, categoryId, includeInactive,
                PageRequests.of(page, size, sort, SORTABLE, Sort.by("name"))), v -> v);
    }

    /** Busca por código de barras o SKU y devuelve unidad y precio vigente (lector de la pantalla de venta). */
    @GetMapping("/api/v1/products/lookup")
    @PreAuthorize("hasAuthority('products:read')")
    public ResolvedPrice lookup(@RequestParam String code, @RequestParam(required = false) UUID priceListId) {
        return lookup.lookup(code, priceListId);
    }

    @GetMapping("/api/v1/products/{id}")
    @PreAuthorize("hasAuthority('products:read')")
    public ProductView get(@PathVariable UUID id) {
        return products.get(id);
    }

    @PostMapping("/api/v1/products")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('products:manage')")
    public ProductView create(@Valid @RequestBody ProductRequest request) {
        return products.create(request.toCommand());
    }

    @PutMapping("/api/v1/products/{id}")
    @PreAuthorize("hasAuthority('products:manage')")
    public ProductView update(@PathVariable UUID id, @Valid @RequestBody ProductRequest request) {
        return products.update(id, request.toCommand());
    }

    @PostMapping("/api/v1/products/{id}/activate")
    @PreAuthorize("hasAuthority('products:manage')")
    public ProductView activate(@PathVariable UUID id) {
        return products.setActive(id, true);
    }

    @PostMapping("/api/v1/products/{id}/deactivate")
    @PreAuthorize("hasAuthority('products:manage')")
    public ProductView deactivate(@PathVariable UUID id) {
        return products.setActive(id, false);
    }

    /** Siguiente código EAN-13 interno (prefijo 29) para asignar a un producto. */
    @PostMapping("/api/v1/barcodes/internal")
    @PreAuthorize("hasAuthority('products:manage')")
    public Map<String, String> internalBarcode() {
        return Map.of("barcode", products.nextInternalBarcode());
    }

    /** Carga masiva desde CSV (UTF-8, separador ';' o ','). Con dryRun=true solo valida. */
    @PostMapping("/api/v1/products/import")
    @PreAuthorize("hasAuthority('products:manage')")
    public ProductImportService.ImportReport importCsv(@RequestParam("file") MultipartFile file,
                                                      @RequestParam(defaultValue = "true") boolean dryRun)
            throws IOException {
        if (file.isEmpty()) {
            throw new BusinessRuleException("El archivo está vacío.");
        }
        if (file.getSize() > MAX_IMPORT_BYTES) {
            throw new BusinessRuleException("El archivo supera 5 MB.");
        }
        return importer.importCsv(decodeUtf8(file.getBytes()), dryRun);
    }

    private static String decodeUtf8(byte[] bytes) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException ex) {
            throw new BusinessRuleException(
                    "El archivo no está en UTF-8. En Excel usa 'Guardar como → CSV UTF-8 (delimitado por comas)'.");
        }
    }
}
