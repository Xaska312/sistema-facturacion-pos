package com.poshibrido.orders.api;

import com.poshibrido.orders.application.OrderQueryService;
import com.poshibrido.orders.application.OrderQueryService.Filter;
import com.poshibrido.orders.application.OrderService;
import com.poshibrido.orders.application.OrderService.CancelInput;
import com.poshibrido.orders.application.OrderService.DeliverInput;
import com.poshibrido.orders.application.OrderService.ItemInput;
import com.poshibrido.orders.application.OrderService.OrderInput;
import com.poshibrido.orders.application.OrderService.PaymentInput;
import com.poshibrido.orders.application.OrderViews.DeliveryResult;
import com.poshibrido.orders.application.OrderViews.OrderRow;
import com.poshibrido.orders.application.OrderViews.OrderView;
import com.poshibrido.orders.application.OrderViews.Summary;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
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

/** Pedidos por encargo (decisión 258). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/orders")
public class OrderController {

    private final OrderQueryService queries;
    private final OrderService service;

    /** {@code width}/{@code length} en metros (los dos o ninguno); si van, la cantidad es el área. */
    public record ItemRequest(@NotNull UUID productId, @Size(max = 200) String description,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 3, fraction = 3)
                              BigDecimal width,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 3, fraction = 3)
                              BigDecimal length,
                              @DecimalMin(value = "0", inclusive = false) @Digits(integer = 10, fraction = 4)
                              BigDecimal quantity,
                              @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 12, fraction = 2)
                              BigDecimal unitPrice) {
    }

    public record OrderRequest(UUID customerId, @NotNull LocalDate dueDate, @Size(max = 255) String address,
                               @Size(max = 1000) String notes, @Size(max = 100) List<@Valid ItemRequest> items) {

        OrderInput toInput() {
            List<ItemInput> lines = items == null ? List.of() : items.stream()
                    .map(i -> new ItemInput(i.productId(), i.description(), i.width(), i.length(), i.quantity(),
                            i.unitPrice()))
                    .toList();
            return new OrderInput(customerId, dueDate, address, notes, lines);
        }
    }

    public record PaymentRequest(@NotNull @DecimalMin(value = "0", inclusive = false)
                                 @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                 @NotNull UUID paymentMethodId,
                                 @Size(max = 60) String reference,
                                 @Size(max = 255) String notes) {
    }

    public record DeliverPayment(@NotNull UUID paymentMethodId,
                                 @NotNull @DecimalMin(value = "0", inclusive = false)
                                 @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                 @Size(max = 60) String reference) {
    }

    public record DeliverRequest(@NotEmpty @Size(max = 100) List<@NotNull UUID> itemIds,
                                 @Size(max = 10) List<@Valid DeliverPayment> payments) {
    }

    public record CancelRequest(@NotBlank @Size(max = 255) String reason, UUID refundMethodId,
                                @Size(max = 60) String reference) {
    }

    /** {@code filter}: OPEN (por defecto), OVERDUE, DELIVERED, CANCELLED o ALL. Busca por cliente, documento o número. */
    @GetMapping
    @PreAuthorize("hasAuthority('orders:read')")
    public PageResponse<OrderRow> list(@RequestParam(defaultValue = "OPEN") Filter filter,
                                       @RequestParam(required = false) String search,
                                       @RequestParam(defaultValue = "0") int page,
                                       @RequestParam(defaultValue = "20") int size) {
        return queries.list(filter, search, page, size);
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('orders:read')")
    public Summary summary() {
        return queries.summary();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('orders:read')")
    public OrderView get(@PathVariable UUID id) {
        return queries.view(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('orders:create')")
    public OrderView create(@Valid @RequestBody OrderRequest request) {
        return service.create(request.toInput());
    }

    /** {@code items}: las líneas pendientes (las entregadas no cambian). */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('orders:create')")
    public OrderView update(@PathVariable UUID id, @Valid @RequestBody OrderRequest request) {
        return service.update(id, request.toInput());
    }

    @PostMapping("/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('orders:create')")
    public OrderView pay(@PathVariable UUID id, @Valid @RequestBody PaymentRequest request,
                         @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return service.pay(id, new PaymentInput(request.amount(), request.paymentMethodId(), request.reference(),
                request.notes()), idempotencyKey);
    }

    /** Entrega como venta (en la caja abierta de quien entrega); requiere además vender. */
    @PostMapping("/{id}/deliver")
    @PreAuthorize("hasAuthority('orders:create') and hasAuthority('sales:create')")
    public DeliveryResult deliver(@PathVariable UUID id, @Valid @RequestBody DeliverRequest request,
                                  @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        List<PaymentLine> payments = request.payments() == null ? List.of() : request.payments().stream()
                .map(p -> new PaymentLine(p.paymentMethodId(), p.amount(), p.reference()))
                .toList();
        return service.deliver(id, new DeliverInput(request.itemIds(), payments), idempotencyKey);
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAuthority('orders:manage')")
    public OrderView cancel(@PathVariable UUID id, @Valid @RequestBody CancelRequest request) {
        return service.cancel(id, new CancelInput(request.reason(), request.refundMethodId(), request.reference()));
    }
}
