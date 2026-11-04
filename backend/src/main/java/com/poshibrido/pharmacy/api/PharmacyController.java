package com.poshibrido.pharmacy.api;

import com.poshibrido.pharmacy.application.PharmacyService;
import com.poshibrido.pharmacy.application.PharmacyService.DispensationView;
import com.poshibrido.pharmacy.application.PharmacyService.TechnicalDirector;
import com.poshibrido.shared.api.PageResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** Farmacia (Fase 13-4, decisión 282), con el módulo Medicamentos: libro de dispensación y director técnico. */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/pharmacy")
public class PharmacyController {

    private final PharmacyService pharmacy;

    public record TechnicalDirectorRequest(@Size(max = 160) String name, @Size(max = 30) String profession,
                                           @Size(max = 40) String license) {
    }

    @GetMapping("/dispensations")
    @PreAuthorize("hasAuthority('pharmacy:records') and hasAuthority('module:medicines')")
    public PageResponse<DispensationView> book(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean antibioticOnly,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return pharmacy.book(from, to, antibioticOnly, search, page, size);
    }

    /** Datos del director técnico: los ve cualquiera con ajustes o farmacia (salen en actas y libros). */
    @GetMapping("/technical-director")
    @PreAuthorize("(hasAuthority('settings:read') or hasAuthority('pharmacy:records') or hasAuthority('inventory:read'))"
            + " and hasAuthority('module:medicines')")
    public TechnicalDirector technicalDirector() {
        return pharmacy.technicalDirector();
    }

    @PutMapping("/technical-director")
    @PreAuthorize("hasAuthority('settings:manage') and hasAuthority('module:medicines')")
    public TechnicalDirector saveTechnicalDirector(@Valid @RequestBody TechnicalDirectorRequest r) {
        return pharmacy.saveTechnicalDirector(new TechnicalDirector(r.name(), r.profession(), r.license()));
    }
}
