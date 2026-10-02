package com.poshibrido.location.api;

import com.poshibrido.location.application.LocationApi;
import com.poshibrido.location.application.LocationService;
import com.poshibrido.shared.error.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Catálogo DIVIPOLA (datos de plataforma, disponible para cualquier usuario autenticado). */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/locations")
public class LocationController {

    private final LocationService locations;

    public record DepartmentResponse(String code, String name) {
    }

    public record CityResponse(String code, String name, String departmentCode) {
    }

    @GetMapping("/departments")
    public List<DepartmentResponse> departments() {
        return locations.departments().stream().map(d -> new DepartmentResponse(d.getCode(), d.getName())).toList();
    }

    @GetMapping("/departments/{code}/cities")
    public List<CityResponse> cities(@PathVariable String code) {
        return locations.citiesOf(code).stream()
                .map(c -> new CityResponse(c.getCode(), c.getName(), c.getDepartmentCode()))
                .toList();
    }

    @GetMapping("/cities/{code}")
    public LocationApi.CityRef city(@PathVariable String code) {
        return locations.findCity(code).orElseThrow(() -> new NotFoundException("Municipio no encontrado."));
    }
}
