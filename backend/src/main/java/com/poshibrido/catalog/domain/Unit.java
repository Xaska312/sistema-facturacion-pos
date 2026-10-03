package com.poshibrido.catalog.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Unidad de medida (UND, KG, LT…). */
@Getter
@Entity
@Table(name = "units")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Unit extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "allows_decimals", nullable = false)
    private boolean allowsDecimals;

    @Column(nullable = false)
    private boolean active;

    public static Unit create(String code, String name, boolean allowsDecimals) {
        Unit unit = new Unit();
        unit.id = Ids.newId();
        unit.code = code;
        unit.name = name;
        unit.allowsDecimals = allowsDecimals;
        unit.active = true;
        return unit;
    }

    public void update(String name, boolean allowsDecimals) {
        this.name = name;
        this.allowsDecimals = allowsDecimals;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
