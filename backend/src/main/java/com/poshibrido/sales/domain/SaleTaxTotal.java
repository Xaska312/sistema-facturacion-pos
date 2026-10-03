package com.poshibrido.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.util.UUID;

/** Base y valor por impuesto de una venta (para la facturación electrónica futura). Inmutable. */
@Getter
@Entity
@Immutable
@Table(name = "sale_tax_totals")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleTaxTotal {

    @EmbeddedId
    private SaleTaxTotalId id;

    @Column(name = "tax_type", nullable = false)
    private String taxType;

    @Column(name = "tax_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal taxRate;

    @Column(name = "taxable_base", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxableBase;

    @Column(name = "tax_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxAmount;

    public static SaleTaxTotal of(UUID saleId, UUID taxId, String taxType, BigDecimal taxRate, BigDecimal taxableBase,
                                  BigDecimal taxAmount) {
        SaleTaxTotal t = new SaleTaxTotal();
        t.id = new SaleTaxTotalId(saleId, taxId);
        t.taxType = taxType;
        t.taxRate = taxRate;
        t.taxableBase = taxableBase;
        t.taxAmount = taxAmount;
        return t;
    }
}
