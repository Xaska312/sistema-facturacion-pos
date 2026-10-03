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

/** Categoría de productos (árbol con {@code parentId}). */
@Getter
@Entity
@Table(name = "categories")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Category extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private boolean active;

    public static Category create(String name, UUID parentId) {
        Category category = new Category();
        category.id = Ids.newId();
        category.name = name;
        category.parentId = parentId;
        category.active = true;
        return category;
    }

    public void update(String name, UUID parentId) {
        this.name = name;
        this.parentId = parentId;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
