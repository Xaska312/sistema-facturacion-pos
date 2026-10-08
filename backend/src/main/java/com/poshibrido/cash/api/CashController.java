package com.poshibrido.cash.api;

import com.poshibrido.cash.application.CashQueryService;
import com.poshibrido.cash.application.CashSessionService;
import com.poshibrido.cash.application.CashViews.MovementView;
import com.poshibrido.cash.application.CashViews.PaymentMethodView;
import com.poshibrido.cash.application.CashViews.RegisterOption;
import com.poshibrido.cash.application.CashViews.SessionReport;
import com.poshibrido.cash.application.CashViews.SessionView;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSessionStatus;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import com.poshibrido.shared.validation.WholePesos;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
 * Caja. Operar (abrir, movimientos, cerrar): {@code cash:operate}. Historial e informes: {@code cash:read}
 * (sin él, cada usuario ve solo sus sesiones). El esperado y la diferencia del arqueo: {@code cash:audit}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1")
public class CashController {

    private final CashSessionService service;
    private final CashQueryService queries;

    public record OpenRequest(@NotNull UUID cashRegisterId,
                              @NotNull @DecimalMin("0")
                              @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal openingAmount,
                              @Size(max = 255) String notes) {
    }

    public record MovementRequest(@NotNull CashMovementType type,
                                  @NotNull @DecimalMin(value = "0", inclusive = false)
                                  @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal amount,
                                  @NotBlank @Size(max = 255) String reason) {
    }

    public record CloseRequest(@NotNull @DecimalMin("0")
                               @Digits(integer = 12, fraction = 2) @WholePesos BigDecimal countedAmount,
                               @Size(max = 500) String notes) {
    }

    @GetMapping("/payment-methods")
    @PreAuthorize("hasAnyAuthority('sales:create', 'sales:read', 'cash:read', 'cash:operate')")
    public List<PaymentMethodView> paymentMethods() {
        return queries.paymentMethods();
    }

    @GetMapping("/cash/registers")
    @PreAuthorize("hasAuthority('cash:operate')")
    public List<RegisterOption> registers() {
        return service.registersForOpening();
    }

    /** Sesión abierta del usuario; 204 si no tiene caja abierta. */
    @GetMapping("/cash/sessions/current")
    @PreAuthorize("hasAnyAuthority('cash:operate', 'sales:create')")
    public ResponseEntity<SessionView> current() {
        return service.current().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/cash/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash:operate')")
    public SessionView open(@Valid @RequestBody OpenRequest request) {
        return service.open(request.cashRegisterId(), request.openingAmount(), request.notes());
    }

    @PostMapping("/cash/sessions/{id}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('cash:operate')")
    public MovementView addMovement(@PathVariable UUID id, @Valid @RequestBody MovementRequest request,
                                    @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
        return service.addMovement(id, request.type(), request.amount(), request.reason(), idempotencyKey);
    }

    @PostMapping("/cash/sessions/{id}/close")
    @PreAuthorize("hasAuthority('cash:operate')")
    public SessionReport close(@PathVariable UUID id, @Valid @RequestBody CloseRequest request) {
        return service.close(id, request.countedAmount(), request.notes());
    }

    @GetMapping("/cash/sessions")
    @PreAuthorize("hasAuthority('cash:read')")
    public PageResponse<SessionView> sessions(@RequestParam(required = false) UUID cashRegisterId,
                                              @RequestParam(required = false) UUID branchId,
                                              @RequestParam(required = false) CashSessionStatus status,
                                              @RequestParam(required = false) UUID userId,
                                              @RequestParam(required = false)
                                              @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                              @RequestParam(required = false)
                                              @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return PageResponse.of(queries.search(cashRegisterId, branchId, status, userId, from, to, page, size), s -> s);
    }

    @GetMapping("/cash/sessions/{id}")
    @PreAuthorize("hasAnyAuthority('cash:read', 'cash:operate')")
    public SessionView session(@PathVariable UUID id) {
        return queries.session(id);
    }

    @GetMapping("/cash/sessions/{id}/movements")
    @PreAuthorize("hasAnyAuthority('cash:read', 'cash:operate')")
    public List<MovementView> movements(@PathVariable UUID id) {
        return queries.movements(id);
    }

    /** Informe de cierre (Z) o parcial (X) si la sesión sigue abierta. */
    @GetMapping("/cash/sessions/{id}/report")
    @PreAuthorize("hasAnyAuthority('cash:read', 'cash:operate')")
    public SessionReport report(@PathVariable UUID id) {
        return queries.report(id);
    }
}
