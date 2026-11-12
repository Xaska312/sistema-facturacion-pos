package com.poshibrido.finance.api;

import com.poshibrido.finance.application.ExpenseViews.ExpenseView;
import com.poshibrido.finance.application.RecurringExpenseService;
import com.poshibrido.finance.application.RecurringExpenseService.DueSummary;
import com.poshibrido.finance.application.RecurringExpenseService.PayCommand;
import com.poshibrido.finance.application.RecurringExpenseService.RecurringView;
import com.poshibrido.finance.application.RecurringExpenseService.SaveCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
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
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Gastos fijos (Finanzas parte A2, decisión 321). Ver con {@code expenses:read}; crear, cambiar, pagar y saltar con
 * {@code expenses:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/recurring-expenses")
public class RecurringExpenseController {

    private final RecurringExpenseService recurring;

    public record SaveRequest(@Size(max = 80) String name, @NotNull UUID categoryId, @NotNull UUID branchId,
                              UUID supplierId, @NotNull BigDecimal amount, @NotNull UUID paymentMethodId,
                              @NotNull String frequency, Integer dayOfMonth, LocalDate startsOn,
                              @Size(max = 255) String note, Boolean active) {
        SaveCommand command() {
            return new SaveCommand(name, categoryId, branchId, supplierId, amount, paymentMethodId, frequency,
                    dayOfMonth, startsOn, note, active);
        }
    }

    public record PayRequest(@NotNull LocalDate dueDate, BigDecimal amount, UUID paymentMethodId, UUID branchId,
                             LocalDate date, UUID supplierId, @Size(max = 100) String reference,
                             @Size(max = 255) String note) {
    }

    public record DateRequest(@NotNull LocalDate dueDate) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('expenses:read')")
    public List<RecurringView> list() {
        return recurring.list();
    }

    /** Lo que toca pagar: vencido (hasta 3 meses) y lo de los próximos 7 días. */
    @GetMapping("/due")
    @PreAuthorize("hasAuthority('expenses:read')")
    public DueSummary due() {
        return recurring.due();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public RecurringView create(@Valid @RequestBody SaveRequest r) {
        return recurring.create(r.command());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('expenses:manage')")
    public RecurringView update(@PathVariable UUID id, @Valid @RequestBody SaveRequest r) {
        return recurring.update(id, r.command());
    }

    @PostMapping("/{id}/pay")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public ExpenseView pay(@PathVariable UUID id, @Valid @RequestBody PayRequest r,
                           @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return recurring.pay(id, new PayCommand(r.dueDate(), r.amount(), r.paymentMethodId(), r.branchId(), r.date(),
                r.supplierId(), r.reference(), r.note()), key);
    }

    @PostMapping("/{id}/skip")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public void skip(@PathVariable UUID id, @Valid @RequestBody DateRequest r) {
        recurring.skip(id, r.dueDate());
    }

    @DeleteMapping("/{id}/skip/{dueDate}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('expenses:manage')")
    public void unskip(@PathVariable UUID id, @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dueDate) {
        recurring.unskip(id, dueDate);
    }
}
