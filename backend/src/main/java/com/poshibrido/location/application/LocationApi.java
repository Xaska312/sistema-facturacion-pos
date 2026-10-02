package com.poshibrido.location.application;

import java.util.Optional;

/** Catálogo DIVIPOLA para otros módulos. */
public interface LocationApi {

    record CityRef(String code, String name, String departmentCode, String departmentName) {
    }

    Optional<CityRef> findCity(String cityCode);
}
