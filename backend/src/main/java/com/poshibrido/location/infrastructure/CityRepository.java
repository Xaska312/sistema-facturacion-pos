package com.poshibrido.location.infrastructure;

import com.poshibrido.location.domain.City;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CityRepository extends JpaRepository<City, String> {

    List<City> findByDepartmentCodeOrderByName(String departmentCode);
}
