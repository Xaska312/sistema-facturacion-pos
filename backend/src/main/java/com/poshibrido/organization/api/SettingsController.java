package com.poshibrido.organization.api;

import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private final BusinessSettingsService service;

    public record SettingsRequest(
            @NotNull Boolean allowNegativeStock,
            @NotNull Boolean pricesIncludeTax,
            @NotBlank @Size(max = 60) String timezone,
            @NotBlank @Size(min = 3, max = 3) String currency,
            @Size(max = 500) String receiptFooter,
            @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal maxDiscountPercent) {
    }

    @GetMapping
    @PreAuthorize("hasAuthority('settings:read')")
    public BusinessSettings get() {
        return service.current();
    }

    @PutMapping
    @PreAuthorize("hasAuthority('settings:manage')")
    public BusinessSettings update(@Valid @RequestBody SettingsRequest request) {
        return service.update(new BusinessSettings(request.allowNegativeStock(), request.pricesIncludeTax(),
                request.timezone().trim(), request.currency().trim(), request.receiptFooter(),
                request.maxDiscountPercent()));
    }
}
