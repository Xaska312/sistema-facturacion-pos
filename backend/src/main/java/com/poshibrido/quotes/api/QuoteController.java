package com.poshibrido.quotes.api;

import com.poshibrido.quotes.application.QuoteQueryService;
import com.poshibrido.quotes.application.QuoteQueryService.Filter;
import com.poshibrido.quotes.application.QuoteService;
import com.poshibrido.quotes.application.QuoteService.ItemInput;
import com.poshibrido.quotes.application.QuoteService.QuoteInput;
import com.poshibrido.quotes.application.QuoteService.SellInput;
import com.poshibrido.quotes.application.QuoteService.ToOrderInput;
import com.poshibrido.quotes.application.QuoteViews.QuoteConfig;
import com.poshibrido.quotes.application.QuoteViews.QuoteRow;
import com.poshibrido.quotes.application.QuoteViews.QuoteView;
import com.poshibrido.quotes.application.QuoteViews.SaleResult;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Cotizaciones (decisión 260). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/quotes")
public class QuoteController {

    private final QuoteQueryService queries;
    private final QuoteService service;

    /** {@code width}/{@code length} en metros (los dos o ninguno); si van, la cantidad es el área. */
    public record ItemRequest(@NotNull UUID productId, @Size(max = 200) String description,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 3, fraction = 3)
                              BigDecimal width,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 3, fraction = 3)
                              BigDecimal length,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 10, fraction = 4)
                              BigDecimal quantity,
                              @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
                              BigDecimal unitPrice,
                              @DecimalMin("0") @DecimalMax(value = "100", inclusive = false)
                              @Digits(integer = 3, fraction = 2) BigDecimal discountPercent) {
    }

    public record QuoteRequest(UUID customerId, @Size(max = 160) String prospectName,
                               @Size(max = 30) String prospectPhone, LocalDate validUntil,
                               @Size(max = 1000) String notes, @Size(max = 1000) String terms,
                               @Size(max = 100) List<@Valid ItemRequest> items) {

        QuoteInput toInput() {
            List<ItemInput> lines = items == null ? List.of() : items.stream()
                    .map(i -> new ItemInput(i.productId(), i.description(), i.width(), i.length(), i.quantity(),
                            i.unitPrice(), i.discountPercent()))
                    .toList();
            return new QuoteInput(customerId, prospectName, prospectPhone, validUntil, notes, terms, lines);
        }
    }

    public record RejectRequest(@NotBlank @Size(max = 255) String reason) {
    }

    public record ToOrderRequest(UUID customerId, @NotNull LocalDate dueDate, @Size(max = 255) String address,
                                 @Size(max = 1000) String notes) {
    }

    public record SalePayment(@NotNull UUID paymentMethodId,
                              @NotNull @DecimalMin(value = "0", inclusive = false)
                              @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                              @Size(max = 60) String reference) {
    }

    public record SellRequest(UUID customerId, @Size(max = 10) List<@Valid SalePayment> payments) {
    }

    /** Vigencia y condiciones por defecto (de Ajustes), para la pantalla de una cotización nueva. */
    @GetMapping("/config")
    @PreAuthorize("hasAuthority('quotes:read')")
    public QuoteConfig config() {
        return queries.config();
    }

    /** {@code filter}: OPEN (vigentes, por defecto), EXPIRED, ACCEPTED, REJECTED o ALL. */
    @GetMapping
    @PreAuthorize("hasAuthority('quotes:read')")
    public PageResponse<QuoteRow> list(@RequestParam(defaultValue = "OPEN") Filter filter,
                                       @RequestParam(required = false) String search,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int size) {
        return queries.list(filter, search, page, size);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('quotes:read')")
    public QuoteView get(@PathVariable UUID id) {
        return queries.view(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('quotes:create')")
    public QuoteView create(@Valid @RequestBody QuoteRequest request) {
        return service.create(request.toInput());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('quotes:create')")
    public QuoteView update(@PathVariable UUID id, @Valid @RequestBody QuoteRequest request) {
        return service.update(id, request.toInput());
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('quotes:create')")
    public QuoteView reject(@PathVariable UUID id, @Valid @RequestBody RejectRequest request) {
        return service.reject(id, request.reason());
    }

    /** Convierte en pedido por encargo; requiere además crear pedidos. */
    @PostMapping("/{id}/order")
    @PreAuthorize("hasAuthority('quotes:create') and hasAuthority('orders:create')")
    public QuoteView toOrder(@PathVariable UUID id, @Valid @RequestBody ToOrderRequest request) {
        return service.toOrder(id, new ToOrderInput(request.customerId(), request.dueDate(), request.address(),
                request.notes()));
    }

    /** Vende con los precios cotizados (en la caja abierta de quien vende); requiere además vender. */
    @PostMapping("/{id}/sell")
    @PreAuthorize("hasAuthority('quotes:create') and hasAuthority('sales:create')")
    public SaleResult sell(@PathVariable UUID id, @Valid @RequestBody SellRequest request,
                           @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        List<PaymentLine> payments = request.payments() == null ? List.of() : request.payments().stream()
                .map(p -> new PaymentLine(p.paymentMethodId(), p.amount(), p.reference()))
                .toList();
        return service.sell(id, new SellInput(request.customerId(), payments), idempotencyKey);
    }
}
