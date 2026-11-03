package com.poshibrido.catalog.api;

import com.poshibrido.catalog.application.CumCatalogService;
import com.poshibrido.catalog.application.CumCatalogService.CumEntry;
import com.poshibrido.catalog.application.MedicineService;
import com.poshibrido.catalog.application.MedicineService.MedicineInput;
import com.poshibrido.catalog.application.MedicineService.MedicineView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Ficha del medicamento de cada producto y búsqueda en el catálogo CUM (Fase 13-1, decisión 279). Solo con el módulo
 * Medicamentos encendido ({@code module:medicines}).
 */
@RestController
@RequiredArgsConstructor
public class MedicineController {

    private final MedicineService medicines;
    private final CumCatalogService catalog;

    public record MedicineRequest(@NotBlank @Size(max = 20) String kind, @Size(max = 80) String sanitaryRegistration,
                                  @Size(max = 30) String cum, @Size(max = 1000) String activeIngredients,
                                  @Size(max = 200) String dosageForm, @Size(max = 120) String route,
                                  @Size(max = 10) String atc, @Size(max = 300) String holder,
                                  @Size(max = 20) String saleCondition, Boolean antibiotic, Boolean coldChain,
                                  Boolean unitSale, Boolean tracksLots) {
    }

    /** 204 si el producto aún no tiene ficha. */
    @GetMapping("/api/v1/products/{id}/medicine")
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:medicines')")
    public ResponseEntity<MedicineView> get(@PathVariable UUID id) {
        return medicines.get(id).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PutMapping("/api/v1/products/{id}/medicine")
    @PreAuthorize("hasAuthority('products:manage') and hasAuthority('module:medicines')")
    public MedicineView save(@PathVariable UUID id, @Valid @RequestBody MedicineRequest r) {
        return medicines.save(id, new MedicineInput(r.kind(), r.sanitaryRegistration(), r.cum(), r.activeIngredients(),
                r.dosageForm(), r.route(), r.atc(), r.holder(), r.saleCondition(), Boolean.TRUE.equals(r.antibiotic()),
                Boolean.TRUE.equals(r.coldChain()), Boolean.TRUE.equals(r.unitSale()),
                Boolean.TRUE.equals(r.tracksLots())));
    }

    /**
     * De los productos del carrito, cuáles se venden con fórmula (Fase 13-4): el POS pide la confirmación (y en
     * antibióticos y control especial, los datos de la fórmula) antes de cobrar. Máximo 200.
     */
    @GetMapping("/api/v1/medicines/dispensing")
    @PreAuthorize("hasAuthority('sales:create') and hasAuthority('module:medicines')")
    public List<MedicineService.DispensingInfo> dispensing(@RequestParam List<UUID> productIds) {
        return medicines.dispensing(productIds);
    }

    @GetMapping("/api/v1/medicines/catalog")
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:medicines')")
    public List<CumEntry> searchCatalog(@RequestParam @Size(max = 100) String q) {
        return catalog.search(q);
    }

    @GetMapping("/api/v1/medicines/catalog/{cum}")
    @PreAuthorize("hasAuthority('products:read') and hasAuthority('module:medicines')")
    public CumEntry catalogEntry(@PathVariable String cum) {
        return catalog.get(cum);
    }
}
