package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.ScaleLabels.Format;
import com.poshibrido.catalog.application.ScaleLabels.Kind;
import com.poshibrido.catalog.application.ScaleService;
import com.poshibrido.catalog.application.ScaleService.PluView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Báscula etiquetadora (fase 8e). Leer: {@code products:read}; configurar y asignar PLU: {@code products:manage}. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/scale")
public class ScaleController {

    private final ScaleService service;

    public record FormatRequest(@NotNull Boolean enabled, @NotBlank String prefix,
                                @NotNull @Min(3) @Max(6) Integer pluDigits, @NotNull Kind kind,
                                @NotNull @Min(0) @Max(3) Integer decimals) {
    }

    public record PluRequest(@NotNull UUID productId) {
    }

    @GetMapping("/settings")
    @PreAuthorize("hasAuthority('products:read')")
    public Format settings() {
        return service.format();
    }

    @PutMapping("/settings")
    @PreAuthorize("hasAuthority('products:manage')")
    public Format updateSettings(@Valid @RequestBody FormatRequest request) {
        return service.updateFormat(new Format(request.enabled(), request.prefix().trim(), request.pluDigits(),
                request.kind(), request.decimals()));
    }

    @GetMapping("/plus")
    @PreAuthorize("hasAuthority('products:read')")
    public List<PluView> plus() {
        return service.plus();
    }

    @PutMapping("/plus/{plu}")
    @PreAuthorize("hasAuthority('products:manage')")
    public PluView assign(@PathVariable String plu, @Valid @RequestBody PluRequest request) {
        return service.assign(plu, request.productId());
    }

    @DeleteMapping("/plus/{plu}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAuthority('products:manage')")
    public void remove(@PathVariable String plu) {
        service.remove(plu);
    }
}
