package com.poshibrido.access.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Permiso del catálogo ({@code recurso:acción}). Lo define el sistema por migración. */
@Getter
@Entity
@Table(name = "permissions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Permission {

    @Id
    private String code;

    @Column(nullable = false)
    private String module;

    @Column(nullable = false)
    private String description;
}
