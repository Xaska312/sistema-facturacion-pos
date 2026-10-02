package com.poshibrido.location.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Municipio (DIVIPOLA). Catálogo de solo lectura sembrado por migración. */
@Getter
@Entity
@Table(name = "cities", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class City {

    @Id
    private String code;

    @Column(name = "department_code", nullable = false)
    private String departmentCode;

    @Column(nullable = false)
    private String name;
}
