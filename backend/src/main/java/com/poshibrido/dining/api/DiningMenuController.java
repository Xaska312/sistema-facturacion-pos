package com.poshibrido.dining.api;

import com.poshibrido.dining.application.DiningMenuService;
import com.poshibrido.dining.application.DiningMenuService.MenuInput;
import com.poshibrido.dining.application.DiningMenuService.MenuView;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Cartas por piso (decisión 294), con el módulo {@code module:tables}. Verlas (para pedir por carta):
 * {@code tables:operate}; crearlas y editarlas: {@code tables:manage} y el plan Empresa ("Caja por zona").
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/dining/menus")
public class DiningMenuController {

    private final DiningMenuService service;

    public record MenuRequest(@NotNull UUID branchId, @NotBlank @Size(max = 40) String name, @NotNull UUID cashRegisterId,
                              @Size(max = 500) List<UUID> categoryIds, @Size(max = 500) List<UUID> productIds) {
    }

    public record MenuUpdate(@NotBlank @Size(max = 40) String name, @NotNull UUID cashRegisterId, @NotNull Boolean active,
                             @Min(0) @Max(1000) Integer position, @Size(max = 500) List<UUID> categoryIds,
                             @Size(max = 500) List<UUID> productIds) {
    }

    @GetMapping
    @PreAuthorize("hasAnyAuthority('tables:operate', 'tables:manage') and hasAuthority('module:tables')")
    public List<MenuView> menus(@RequestParam(required = false) UUID branchId) {
        return service.menus(branchId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('tables:manage') and hasAuthority('module:tables')")
    public MenuView create(@Valid @RequestBody MenuRequest r) {
        return service.create(r.branchId(), new MenuInput(r.name(), r.cashRegisterId(), true, null, r.categoryIds(),
                r.productIds()));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('tables:manage') and hasAuthority('module:tables')")
    public MenuView update(@PathVariable UUID id, @Valid @RequestBody MenuUpdate r) {
        return service.update(id, new MenuInput(r.name(), r.cashRegisterId(), r.active(), r.position(), r.categoryIds(),
                r.productIds()));
    }
}
