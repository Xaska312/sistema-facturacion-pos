package com.poshibrido.catalog.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/** Presentación de un producto: {@code factor} unidades base por unidad (p. ej. CAJA = 24 UND). */
@Getter
@Entity
@Table(name = "product_unit_conversions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductUnitConversion {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @Column(name = "unit_id", nullable = false, updatable = false)
    private UUID unitId;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal factor;

    /** Precio propio en la lista General; nulo = precio base × factor. */
    @Column(name = "sale_price", precision = 14, scale = 2)
    private BigDecimal salePrice;

    ProductUnitConversion(Product product, UUID unitId, BigDecimal factor, BigDecimal salePrice) {
        this.id = Ids.newId();
        this.product = product;
        this.unitId = unitId;
        this.factor = factor;
        this.salePrice = salePrice;
    }

    void update(BigDecimal factor, BigDecimal salePrice) {
        this.factor = factor;
        this.salePrice = salePrice;
    }
}
