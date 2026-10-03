package com.poshibrido.sales.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.UUID;

@Getter
@Embeddable
@EqualsAndHashCode
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleTaxTotalId implements Serializable {

    @Column(name = "sale_id", nullable = false)
    private UUID saleId;

    @Column(name = "tax_id", nullable = false)
    private UUID taxId;
}
