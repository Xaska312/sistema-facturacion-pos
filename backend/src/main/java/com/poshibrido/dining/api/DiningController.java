package com.poshibrido.dining.api;

import com.poshibrido.dining.application.DiningService;
import com.poshibrido.dining.application.DiningViews.Floor;
import com.poshibrido.dining.application.DiningViews.TableView;
import com.poshibrido.dining.application.DiningViews.ZoneView;
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
 * Mesas por zona (Fase 12b-2, decisión 269), con el módulo {@code module:tables}. Ver el salón:
 * {@code tables:operate}; configurar zonas y mesas: {@code tables:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/dining")
public class DiningController {

    private final DiningService service;

    public record ZoneRequest(@NotNull UUID branchId, @NotBlank @Size(max = 40) String name) {
    }

    public record ZoneUpdate(@NotBlank @Size(max = 40) String name, @Min(0) @Max(1000) Integer position,
                             @NotNull Boolean active) {
    }

    public record TableRequest(@NotNull UUID zoneId, @NotBlank @Size(max = 20) String name,
                               @Min(1) @Max(99) Integer seats) {
    }

    public record TableUpdate(UUID zoneId, @NotBlank @Size(max = 20) String name, @Min(1) @Max(99) Integer seats,
                              @Min(0) @Max(1000) Integer position, @NotNull Boolean active) {
    }

    @GetMapping("/floor")
    @PreAuthorize("hasAuthority('tables:operate') and hasAuthority('module:tables')")
    public Floor floor(@RequestParam(required = false) UUID branchId) {
        return service.floor(branchId);
    }

    @GetMapping("/zones")
    @PreAuthorize("hasAuthority('tables:operate') and hasAuthority('module:tables')")
    public List<ZoneView> zones(@RequestParam(required = false) UUID branchId) {
        return service.zones(branchId);
    }

    @PostMapping("/zones")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('tables:manage')")
    public ZoneView createZone(@Valid @RequestBody ZoneRequest request) {
        return service.createZone(request.branchId(), request.name());
    }

    @PutMapping("/zones/{id}")
    @PreAuthorize("hasAuthority('tables:manage')")
    public ZoneView updateZone(@PathVariable UUID id, @Valid @RequestBody ZoneUpdate request) {
        return service.updateZone(id, request.name(), request.position(), request.active());
    }

    @PostMapping("/tables")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('tables:manage')")
    public TableView createTable(@Valid @RequestBody TableRequest request) {
        return service.createTable(request.zoneId(), request.name(), request.seats());
    }

    @PutMapping("/tables/{id}")
    @PreAuthorize("hasAuthority('tables:manage')")
    public TableView updateTable(@PathVariable UUID id, @Valid @RequestBody TableUpdate request) {
        return service.updateTable(id, request.zoneId(), request.name(), request.seats(), request.position(),
                request.active());
    }
}
