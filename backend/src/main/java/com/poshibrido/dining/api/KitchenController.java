package com.poshibrido.dining.api;

import com.poshibrido.dining.application.KitchenService;
import com.poshibrido.dining.application.KitchenService.StationInput;
import com.poshibrido.dining.application.KitchenViews.StationView;
import com.poshibrido.dining.application.KitchenViews.TicketView;
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
 * Cocina y comandas (Fase 12b-3, decisión 270), con el módulo {@code module:kitchen} (sus permisos no llegan al token
 * con el módulo apagado). Ver e imprimir comandas: {@code kitchen:send}; configurar estaciones: {@code kitchen:manage}.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/kitchen")
public class KitchenController {

    private final KitchenService service;

    public record StationRequest(@NotBlank @Size(max = 40) String name, Boolean main, Boolean active,
                                 @Min(0) @Max(1000) Integer position,
                                 @Size(max = 500) List<@NotNull UUID> categoryIds,
                                 @Size(max = 500) List<@NotNull UUID> productIds) {

        StationInput toInput(boolean activeByDefault) {
            return new StationInput(name, Boolean.TRUE.equals(main), active == null ? activeByDefault : active,
                    position, categoryIds, productIds);
        }
    }

    public record PrintRequest(Boolean auto) {
    }

    @GetMapping("/stations")
    @PreAuthorize("hasAnyAuthority('kitchen:send', 'kitchen:manage')")
    public List<StationView> stations() {
        return service.stations();
    }

    @PostMapping("/stations")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAuthority('kitchen:manage')")
    public StationView create(@Valid @RequestBody StationRequest request) {
        return service.createStation(request.toInput(true));
    }

    @PutMapping("/stations/{id}")
    @PreAuthorize("hasAuthority('kitchen:manage')")
    public StationView update(@PathVariable UUID id, @Valid @RequestBody StationRequest request) {
        return service.updateStation(id, request.toInput(true));
    }

    /** Comandas recientes de la sucursal; {@code pending=true}: las que nadie ha impreso (impresora automática). */
    @GetMapping("/tickets")
    @PreAuthorize("hasAuthority('kitchen:send')")
    public List<TicketView> tickets(@RequestParam(required = false) UUID branchId,
                                    @RequestParam(required = false) List<UUID> stationId,
                                    @RequestParam(defaultValue = "false") boolean pending) {
        return service.tickets(branchId, stationId, pending);
    }

    @GetMapping("/tickets/{id}")
    @PreAuthorize("hasAuthority('kitchen:send')")
    public TicketView ticket(@PathVariable UUID id) {
        return service.ticket(id);
    }

    /** Registra una impresión ({@code auto}: la reclama la impresora automática; 409 si otro equipo ya la imprimió). */
    @PostMapping("/tickets/{id}/print")
    @PreAuthorize("hasAuthority('kitchen:send')")
    public TicketView print(@PathVariable UUID id, @RequestBody(required = false) PrintRequest request) {
        return service.print(id, request != null && Boolean.TRUE.equals(request.auto()));
    }
}
