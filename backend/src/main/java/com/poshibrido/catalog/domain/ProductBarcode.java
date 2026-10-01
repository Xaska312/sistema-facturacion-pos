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

import java.util.UUID;

/** Código de barras de un producto. {@code unitId} nulo = unidad base; si no, una presentación. */
@Getter
@Entity
@Table(name = "product_barcodes")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProductBarcode {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, updatable = false)
    private Product product;

    @Column(name = "unit_id")
    private UUID unitId;

    @Column(nullable = false, updatable = false)
    private String barcode;

    @Column(nullable = false)
    private boolean internal;

    ProductBarcode(Product product, String barcode, UUID unitId, boolean internal) {
        this.id = Ids.newId();
        this.product = product;
        this.barcode = barcode;
        this.unitId = unitId;
        this.internal = internal;
    }

    void changeUnit(UUID unitId) {
        this.unitId = unitId;
    }
}
