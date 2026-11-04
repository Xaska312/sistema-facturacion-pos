package com.poshibrido.purchasing.api;

import com.poshibrido.purchasing.application.PurchaseService;
import com.poshibrido.purchasing.application.PurchaseService.LineCommand;
import com.poshibrido.purchasing.application.PurchaseService.PaymentCommand;
import com.poshibrido.purchasing.application.PurchaseService.ReceiveCommand;
import com.poshibrido.purchasing.application.PurchaseViews.Payables;
import com.poshibrido.purchasing.application.PurchaseViews.PaymentView;
import com.poshibrido.purchasing.application.PurchaseViews.ReceiptSummary;
import com.poshibrido.purchasing.application.PurchaseViews.ReceiptView;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
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

/** Compras (Fase 13-2, decisión 280): recepción de mercancía contra factura, consulta y cuentas por pagar. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/purchases")
public class PurchaseController {

    private final PurchaseService purchases;

    public record LineRequest(@NotNull UUID productId, UUID unitId, @NotNull BigDecimal quantity,
                              @NotNull BigDecimal unitCost, BigDecimal taxRate, @Size(max = 40) String lotNumber,
                              LocalDate expirationDate, @Size(max = 10) String status,
                              @Size(max = 200) String rejectReason) {
    }

    public record ReceiveRequest(@NotNull UUID branchId, @NotNull UUID supplierId,
                                 @NotNull @Size(max = 40) String supplierInvoice, @NotNull LocalDate invoiceDate,
                                 @NotNull @Size(max = 10) String paymentType, UUID paymentMethodId, LocalDate dueDate,
                                 @Size(max = 100) String paymentReference, Boolean checksConfirmed,
                                 BigDecimal coldChainTemperature, @Size(max = 500) String notes,
                                 @NotEmpty @Size(max = 300) List<@Valid LineRequest> lines) {
    }

    public record ReturnLineRequest(@NotNull Integer receiptLineNo, @NotNull BigDecimal quantity) {
    }

    public record ReturnRequest(@NotNull @Size(max = 255) String reason,
                                @NotEmpty @Size(max = 300) List<@Valid ReturnLineRequest> lines) {
    }

    public record PaymentRequest(@NotNull BigDecimal amount, @NotNull UUID paymentMethodId,
                                 @Size(max = 100) String reference) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('purchases:receive')")
    public ReceiptView receive(@Valid @RequestBody ReceiveRequest r,
                               @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        List<LineCommand> lines = r.lines().stream().map(l -> new LineCommand(l.productId(), l.unitId(), l.quantity(),
                l.unitCost(), l.taxRate(), l.lotNumber(), l.expirationDate(), l.status(), l.rejectReason())).toList();
        return purchases.receive(new ReceiveCommand(r.branchId(), r.supplierId(), r.supplierInvoice(), r.invoiceDate(),
                r.paymentType(), r.paymentMethodId(), r.dueDate(), r.paymentReference(),
                Boolean.TRUE.equals(r.checksConfirmed()), r.coldChainTemperature(), r.notes(), lines), key);
    }

    @GetMapping
    @PreAuthorize("hasAuthority('purchases:read')")
    public PageResponse<ReceiptSummary> list(@RequestParam(required = false) UUID supplierId,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "20") int size) {
        return purchases.list(supplierId, page, size);
    }

    @GetMapping("/payables")
    @PreAuthorize("hasAuthority('purchases:read')")
    public Payables payables(@RequestParam(required = false) UUID supplierId) {
        return purchases.payables(supplierId);
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('purchases:read')")
    public ReceiptView get(@PathVariable UUID id) {
        return purchases.get(id);
    }

    /** Devolución al proveedor (Fase 13-3). */
    @PostMapping("/{id}/returns")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('purchases:receive')")
    public ReceiptView returnGoods(@PathVariable UUID id, @Valid @RequestBody ReturnRequest r,
                                   @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return purchases.returnGoods(id, new PurchaseService.ReturnCommand(r.reason(), r.lines().stream()
                .map(l -> new PurchaseService.ReturnLine(l.receiptLineNo(), l.quantity())).toList()), key);
    }

    @PostMapping("/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('purchases:pay')")
    public PaymentView pay(@PathVariable UUID id, @Valid @RequestBody PaymentRequest r,
                           @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return purchases.addPayment(id, new PaymentCommand(r.amount(), r.paymentMethodId(), r.reference()), key);
    }
}
