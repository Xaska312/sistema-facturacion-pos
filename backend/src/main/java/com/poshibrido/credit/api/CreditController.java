package com.poshibrido.credit.api;

import com.poshibrido.credit.application.CreditQueryService;
import com.poshibrido.credit.application.CreditQueryService.Filter;
import com.poshibrido.credit.application.CreditService;
import com.poshibrido.credit.application.CreditService.PaymentCommand;
import com.poshibrido.credit.application.CreditViews.AccountView;
import com.poshibrido.credit.application.CreditViews.EntryView;
import com.poshibrido.credit.application.CreditViews.Summary;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.UUID;

/** Fiado: cartera, cuenta de cada cliente, abonos y su anulación (decisión 255). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/credit")
public class CreditController {

    private final CreditQueryService queries;
    private final CreditService service;

    public record PaymentRequest(@NotNull @DecimalMin(value = "0", inclusive = false)
                                 @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                 @NotNull UUID paymentMethodId,
                                 @Size(max = 60) String reference,
                                 @Size(max = 255) String notes) {
    }

    public record VoidRequest(@NotBlank @Size(max = 255) String reason) {
    }

    /** Totales de lo que deben los clientes, por antigüedad. */
    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('credit:read')")
    public Summary summary() {
        return queries.summary();
    }

    /** Cartera: {@code filter=DEBT} (por defecto) solo quienes deben; {@code ALL} también los que tienen cupo. */
    @GetMapping("/accounts")
    @PreAuthorize("hasAuthority('credit:read')")
    public PageResponse<AccountView> accounts(@RequestParam(required = false) String search,
                                              @RequestParam(defaultValue = "DEBT") Filter filter,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return queries.accounts(search, filter, page, size);
    }

    @GetMapping("/accounts/{customerId}")
    @PreAuthorize("hasAuthority('credit:read')")
    public AccountView account(@PathVariable UUID customerId) {
        return queries.account(customerId);
    }

    @GetMapping("/accounts/{customerId}/entries")
    @PreAuthorize("hasAuthority('credit:read')")
    public PageResponse<EntryView> entries(@PathVariable UUID customerId,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return queries.entries(customerId, page, size);
    }

    @PostMapping("/accounts/{customerId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('credit:collect')")
    public EntryView pay(@PathVariable UUID customerId, @Valid @RequestBody PaymentRequest request,
                         @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return service.recordPayment(customerId, new PaymentCommand(request.amount(), request.paymentMethodId(),
                request.reference(), request.notes()), idempotencyKey);
    }

    @PostMapping("/payments/{entryId}/void")
    @PreAuthorize("hasAuthority('credit:manage')")
    public EntryView voidPayment(@PathVariable UUID entryId, @Valid @RequestBody VoidRequest request) {
        return service.voidPayment(entryId, request.reason());
    }
}
