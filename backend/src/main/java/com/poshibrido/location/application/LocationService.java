package com.poshibrido.location.application;

import com.poshibrido.location.domain.City;
import com.poshibrido.location.domain.Department;
import com.poshibrido.location.infrastructure.CityRepository;
import com.poshibrido.location.infrastructure.DepartmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class LocationService implements LocationApi {

    private final DepartmentRepository departments;
    private final CityRepository cities;

    @Transactional(readOnly = true)
    public List<Department> departments() {
        return departments.findAll(Sort.by("name"));
    }

    @Transactional(readOnly = true)
    public List<City> citiesOf(String departmentCode) {
        return cities.findByDepartmentCodeOrderByName(departmentCode);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CityRef> findCity(String cityCode) {
        if (cityCode == null || !cityCode.matches("^\\d{5}$")) {
            return Optional.empty();
        }
        return cities.findById(cityCode).map(city -> new CityRef(city.getCode(), city.getName(),
                city.getDepartmentCode(),
                departments.findById(city.getDepartmentCode()).map(d -> d.getName()).orElse("")));
    }
}
