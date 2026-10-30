package com.poshibrido.dining.api;

import com.poshibrido.dining.application.DiningViews.TabView;
import com.poshibrido.dining.application.TabService;
import com.poshibrido.dining.application.TabService.Details;
import com.poshibrido.dining.application.TabService.ItemInput;
import com.poshibrido.dining.application.TabService.OpenCommand;
import com.poshibrido.sales.application.ModifierChoices;
import com.poshibrido.sales.application.SaleCommands;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.sales.application.SaleQueryService;
import com.poshibrido.sales.application.SaleViews.SaleView;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Cuentas abiertas (Fase 12b-2, decisión 269), con el módulo {@code module:tables}. Atender: {@code tables:operate};
 * cobrar: además {@code sales:create} y caja abierta ({@code POST /{id}/charge} exige {@code Idempotency-Key}).
 * Enviar a cocina (Fase 12b-3): además {@code kitchen:send} con el módulo {@code module:kitchen}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/tabs")
@PreAuthorize("hasAuthority('tables:operate') and hasAuthority('module:tables')")
public class TabController {

    private final TabService service;
    private final SaleQueryService sales;

    public record OpenRequest(UUID branchId, @NotNull @Pattern(regexp = "TABLE|TAKEAWAY|DELIVERY") String kind,
                              UUID tableId, @Min(1) @Max(99) Integer guests, @Size(max = 120) String customerName,
                              @Size(max = 30) String phone, @Size(max = 200) String address,
                              @Size(max = 200) String notes) {
    }

    public record DetailsRequest(@Min(1) @Max(99) Integer guests, @Size(max = 120) String customerName,
                                 @Size(max = 30) String phone, @Size(max = 200) String address,
                                 @Size(max = 200) String notes) {
    }

    public record ModifierRequest(@NotNull UUID optionId, @Min(1) @Max(10) Integer quantity) {
    }

    public record ItemRequest(@NotNull UUID productId, UUID unitId,
                              @NotNull @DecimalMin(value = "0", inclusive = false)
                              @Digits(integer = 10, fraction = 4) BigDecimal quantity,
                              @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal unitPrice,
                              @Size(max = 30) List<@Valid @NotNull ModifierRequest> modifiers,
                              @Size(max = 140) String note) {
    }

    /** {@code send}: enviar a cocina de una vez (Fase 12b-3). */
    public record ItemsRequest(@NotEmpty @Size(max = 50) List<@Valid @NotNull ItemRequest> items, Boolean send) {
    }

    public record ReasonRequest(@NotBlank @Size(max = 200) String reason) {
    }

    public record MoveRequest(@NotNull UUID tableId) {
    }

    public record MergeRequest(@NotNull UUID fromTabId) {
    }

    public record PaymentRequest(@NotNull UUID paymentMethodId,
                                 @NotNull @DecimalMin(value = "0", inclusive = false)
                                 @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                 @Size(max = 60) String reference) {
    }

    /** Una parte de lo pedido (Fase 12b-5): la línea y cuántas unidades se cobran. */
    public record PartRequest(@NotNull UUID itemId,
                              @NotNull @DecimalMin(value = "0", inclusive = false)
                              @Digits(integer = 10, fraction = 4) BigDecimal quantity) {
    }

    /** Propina voluntaria (Fase 12b-5): aparte de la venta, con uno de los medios de pago de la cuenta. */
    public record TipRequest(@NotNull @DecimalMin(value = "0", inclusive = false)
                             @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                             @NotNull UUID paymentMethodId, @Min(0) @Max(100) Integer suggestedPercent) {
    }

    /** Sin {@code items} se cobra todo lo pendiente; con {@code items}, solo esa parte (Fase 12b-5). */
    public record ChargeRequest(UUID customerId, @NotEmpty @Size(max = 10) List<@Valid @NotNull PaymentRequest> payments,
                                @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal expectedTotal,
                                @Size(max = 200) List<@Valid @NotNull PartRequest> items, @Valid TipRequest tip) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TabView open(@Valid @RequestBody OpenRequest r) {
        return service.open(new OpenCommand(r.branchId(), r.kind(), r.tableId(), r.guests(), r.customerName(),
                r.phone(), r.address(), r.notes()));
    }

    @GetMapping("/{id}")
    public TabView get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PutMapping("/{id}")
    public TabView update(@PathVariable UUID id, @Valid @RequestBody DetailsRequest r) {
        return service.update(id, new Details(r.guests(), r.customerName(), r.phone(), r.address(), r.notes()));
    }

    @PostMapping("/{id}/items")
    public TabView addItems(@PathVariable UUID id, @Valid @RequestBody ItemsRequest request) {
        return service.addItems(id, request.items().stream()
                .map(i -> new ItemInput(i.productId(), i.unitId(), i.quantity(), i.unitPrice(),
                        i.modifiers() == null ? List.of() : i.modifiers().stream()
                                .map(m -> new ModifierChoices.Choice(m.optionId(), m.quantity() == null ? 1 : m.quantity()))
                                .toList(),
                        i.note()))
                .toList(), Boolean.TRUE.equals(request.send()));
    }

    /** Envía a cocina lo que la cuenta tiene sin enviar. */
    @PostMapping("/{id}/send")
    @PreAuthorize("hasAuthority('tables:operate') and hasAuthority('module:tables') and hasAuthority('kitchen:send')"
            + " and hasAuthority('module:kitchen')")
    public TabView send(@PathVariable UUID id) {
        return service.sendPending(id);
    }

    @PostMapping("/{id}/items/{itemId}/void")
    public TabView voidItem(@PathVariable UUID id, @PathVariable UUID itemId, @Valid @RequestBody ReasonRequest r) {
        return service.voidItem(id, itemId, r.reason());
    }

    @PostMapping("/{id}/move")
    public TabView move(@PathVariable UUID id, @Valid @RequestBody MoveRequest r) {
        return service.move(id, r.tableId());
    }

    @PostMapping("/{id}/merge")
    public TabView merge(@PathVariable UUID id, @Valid @RequestBody MergeRequest r) {
        return service.merge(id, r.fromTabId());
    }

    @PostMapping("/{id}/cancel")
    public TabView cancel(@PathVariable UUID id, @Valid @RequestBody ReasonRequest r) {
        return service.cancel(id, r.reason());
    }

    /** Cobra la cuenta completa: 201 con la venta (como {@code POST /sales}). */
    @PostMapping("/{id}/charge")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('tables:operate') and hasAuthority('module:tables') and hasAuthority('sales:create')")
    public SaleView charge(@PathVariable UUID id, @Valid @RequestBody ChargeRequest r,
                           @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        UUID saleId = service.charge(id, r.customerId(), r.payments().stream()
                .map(p -> new PaymentLine(p.paymentMethodId(), p.amount(), p.reference())).toList(),
                r.expectedTotal(), idempotencyKey,
                r.items() == null ? null : r.items().stream()
                        .map(p -> new TabService.ChargePart(p.itemId(), p.quantity())).toList(),
                r.tip() == null ? null : new SaleCommands.Tip(r.tip().amount(), r.tip().paymentMethodId(),
                        r.tip().suggestedPercent()));
        return sales.sale(saleId);
    }
}
