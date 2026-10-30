package com.poshibrido.dining.api;

import com.poshibrido.dining.application.TipService;
import com.poshibrido.dining.application.TipService.PayoutInput;
import com.poshibrido.dining.application.TipService.PayoutView;
import com.poshibrido.dining.application.TipService.Summary;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Propinas (Fase 12b-5, decisión 272), con el permiso {@code tips:manage} (del módulo de mesas): lo recogido, lo
 * pendiente por repartir y el registro del reparto en partes iguales.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/tips")
@PreAuthorize("hasAuthority('tips:manage')")
public class TipController {

    private final TipService service;

    public record PayoutRequest(UUID branchId,
                                @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                @NotNull @DecimalMin(value = "0", inclusive = false)
                                @Digits(integer = 12, fraction = 2) BigDecimal amount,
                                @NotEmpty @Size(max = 50) List<@NotNull UUID> memberIds,
                                @NotNull Boolean fromCash, @Size(max = 200) String notes) {
    }

    @GetMapping
    public Summary summary(@RequestParam(required = false) UUID branchId,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.summary(branchId, from, to);
    }

    @PostMapping("/payouts")
    @ResponseStatus(HttpStatus.CREATED)
    public PayoutView payout(@Valid @RequestBody PayoutRequest r) {
        return service.payout(new PayoutInput(r.branchId(), r.from(), r.to(), r.amount(), r.memberIds(), r.fromCash(),
                r.notes()));
    }
}
