package com.poshibrido.location.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Departamento (DIVIPOLA). Catálogo de solo lectura sembrado por migración. */
@Getter
@Entity
@Table(name = "departments", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Department {

    @Id
    private String code;

    @Column(nullable = false)
    private String name;
}
