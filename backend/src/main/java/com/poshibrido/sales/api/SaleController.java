package com.poshibrido.sales.api;

import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.sales.application.SaleCommands;
import com.poshibrido.sales.application.SaleQueryService;
import com.poshibrido.sales.application.SaleService;
import com.poshibrido.sales.application.SaleViews.PosConfig;
import com.poshibrido.sales.application.SaleViews.SaleRow;
import com.poshibrido.sales.application.SaleViews.SaleView;
import com.poshibrido.sales.domain.SaleStatus;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Ventas. Registrar: {@code sales:create} (con caja abierta); consultar: {@code sales:read}; anular:
 * {@code sales:void}. {@code POST /sales} exige el encabezado {@code Idempotency-Key}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/sales")
public class SaleController {

    private final SaleService service;
    private final SaleQueryService queries;

    public record ItemRequest(@NotNull UUID productId, UUID unitId,
                              @NotNull @DecimalMin(value = "0", inclusive = false)
                              @Digits(integer = 10, fraction = 4) BigDecimal quantity,
                              @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2)
                              BigDecimal discountPercent,
                              @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal unitPrice) {
    }

    public record PaymentRequest(@NotNull UUID paymentMethodId,
                                 @NotNull @DecimalMin(value = "0", inclusive = false)
                                 @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                 @Size(max = 60) String reference) {
    }

    public record CreateSaleRequest(UUID customerId,
                                    @NotEmpty @Size(max = 200) List<@Valid @NotNull ItemRequest> items,
                                    @Size(max = 10) List<@Valid @NotNull PaymentRequest> payments,
                                    @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal expectedTotal,
                                    @Size(max = 255) String notes) {

        SaleCommands.Create toCommand() {
            return new SaleCommands.Create(customerId,
                    items.stream().map(i -> new SaleCommands.ItemLine(i.productId(), i.unitId(), i.quantity(),
                            i.discountPercent(), i.unitPrice())).toList(),
                    payments == null ? List.of() : payments.stream()
                            .map(p -> new SaleCommands.PaymentLine(p.paymentMethodId(), p.amount(), p.reference()))
                            .toList(),
                    expectedTotal, notes);
        }
    }

    public record VoidRequest(@NotBlank @Size(max = 200) String reason) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('sales:create')")
    public SaleView create(@Valid @RequestBody CreateSaleRequest request,
                           @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return service.create(request.toCommand(), idempotencyKey);
    }

    @PostMapping("/{id}/void")
    @PreAuthorize("hasAuthority('sales:void')")
    public SaleView voidSale(@PathVariable UUID id, @Valid @RequestBody VoidRequest request) {
        return service.voidSale(id, request.reason());
    }

    @GetMapping
    @PreAuthorize("hasAuthority('sales:read')")
    public PageResponse<SaleRow> search(@RequestParam(required = false)
                                        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                        @RequestParam(required = false)
                                        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                        @RequestParam(required = false) UUID branchId,
                                        @RequestParam(required = false) SaleStatus status,
                                        @RequestParam(required = false) UUID cashSessionId,
                                        @RequestParam(required = false) String search,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(queries.search(from, to, branchId, status, cashSessionId, search, page, size), r -> r);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('sales:read')")
    public SaleView sale(@PathVariable UUID id) {
        return queries.sale(id);
    }

    /** Ajustes del negocio que usa la pantalla de venta. */
    @GetMapping("/config")
    @PreAuthorize("hasAuthority('sales:create')")
    public PosConfig config() {
        return queries.posConfig();
    }

    /** Precio vigente para el cliente (al cambiar de cliente o de presentación en el carrito). */
    @GetMapping("/price")
    @PreAuthorize("hasAuthority('sales:create')")
    public ResolvedPrice price(@RequestParam UUID productId, @RequestParam(required = false) UUID unitId,
                               @RequestParam(required = false) UUID customerId) {
        return queries.price(productId, unitId, customerId);
    }
}
