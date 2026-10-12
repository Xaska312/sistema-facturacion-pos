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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Modelo con tallas y colores (fase 8d), p. ej. "Tenis Runner". No se vende ni tiene existencias: lo hacen sus
 * variantes, que son productos normales. El precio (igual para todas las variantes) y los datos básicos se copian a
 * cada variante al guardar.
 */
@Getter
@Entity
@Table(name = "product_models")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductModel extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "sku_prefix", nullable = false)
    private String skuPrefix;

    @Column(nullable = false)
    private String name;

    @Column
    private String description;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "tax_id", nullable = false)
    private UUID taxId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal cost;

    @Column(name = "sale_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal salePrice;

    @Column(name = "size_scale_id", nullable = false)
    private UUID sizeScaleId;

    @Column(nullable = false)
    private boolean active;

    public record Data(String name, String description, UUID categoryId, UUID taxId, BigDecimal cost,
                       BigDecimal salePrice) {
    }

    public static ProductModel create(String skuPrefix, UUID sizeScaleId, Data data) {
        ProductModel model = new ProductModel();
        model.id = Ids.newId();
        model.skuPrefix = skuPrefix;
        model.sizeScaleId = sizeScaleId;
        model.active = true;
        model.apply(data);
        return model;
    }

    public void apply(Data data) {
        this.name = data.name();
        this.description = data.description();
        this.categoryId = data.categoryId();
        this.taxId = data.taxId();
        this.cost = data.cost().setScale(2, RoundingMode.HALF_UP);
        this.salePrice = data.salePrice().setScale(2, RoundingMode.HALF_UP);
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
