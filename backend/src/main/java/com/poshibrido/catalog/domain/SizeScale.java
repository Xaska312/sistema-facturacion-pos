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

/** Escala de tallas (calzado Colombia, EU, US, niño, ropa…). Sus tallas viven en {@code size_scale_sizes}. */
@Getter
@Entity
@Table(name = "size_scales")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SizeScale extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(nullable = false)
    private boolean active;

    public static SizeScale create(String code, String name, int sortOrder) {
        SizeScale scale = new SizeScale();
        scale.id = Ids.newId();
        scale.code = code;
        scale.name = name;
        scale.sortOrder = sortOrder;
        scale.active = true;
        return scale;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
