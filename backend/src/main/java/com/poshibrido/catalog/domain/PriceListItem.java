package com.poshibrido.catalog.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/** Precio de un producto (en una unidad) dentro de una lista distinta de la General. */
@Getter
@Entity
@Table(name = "price_list_items")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PriceListItem {

    @EmbeddedId
    private PriceListItemId id;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal price;

    public PriceListItem(PriceListItemId id, BigDecimal price) {
        this.id = id;
        this.price = price;
    }

    public void changePrice(BigDecimal price) {
        this.price = price;
    }
}
