package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.ModifierService;
import com.poshibrido.catalog.application.ModifierService.GroupInput;
import com.poshibrido.catalog.application.ModifierService.GroupView;
import com.poshibrido.catalog.application.ModifierService.OptionInput;
import com.poshibrido.catalog.application.ModifierService.PosCatalog;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Adiciones (Fase 12b-1, decisión 268). Solo con el módulo encendido ({@code module:modifiers}). Ver y usar en el
 * POS: {@code products:read}; crear y editar: {@code modifiers:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/modifier-groups")
public class ModifierController {

    private final ModifierService service;

    public record OptionRequest(UUID id, @NotBlank @Size(max = 60) String name,
                                @Digits(integer = 8, fraction = 2) BigDecimal priceDelta,
                                @Min(1) @Max(10) Integer maxQuantity, Boolean active) {
    }

    public record GroupRequest(@NotBlank @Size(max = 60) String name,
                               @NotNull @Min(0) @Max(20) Integer minSelect,
                               @NotNull @Min(1) @Max(20) Integer maxSelect,
                               Boolean active,
                               @NotNull @Size(min = 1, max = 30) List<@Valid @NotNull OptionRequest> options,
                               @Size(max = 500) List<@NotNull UUID> productIds,
                               @Size(max = 500) List<@NotNull UUID> categoryIds) {

        GroupInput toInput() {
            return new GroupInput(name, minSelect, maxSelect, active == null || active,
                    options.stream().map(o -> new OptionInput(o.id(), o.name(), o.priceDelta(), o.maxQuantity(),
                            o.active())).toList(),
                    productIds, categoryIds);
        }
    }

    @GetMapping
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:modifiers')")
    public List<GroupView> list() {
        return service.list();
    }

    /** Para el POS: grupos activos y a qué productos y categorías aplican (se carga una vez al abrir la venta). */
    @GetMapping("/pos")
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:modifiers')")
    public PosCatalog pos() {
        return service.posCatalog();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:modifiers')")
    public GroupView get(@PathVariable UUID id) {
        return service.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('modifiers:manage')")
    public GroupView create(@Valid @RequestBody GroupRequest request) {
        return service.create(request.toInput());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('modifiers:manage')")
    public GroupView update(@PathVariable UUID id, @Valid @RequestBody GroupRequest request) {
        return service.update(id, request.toInput());
    }
}
