package com.poshibrido.catalog.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/** Impuesto aplicable a productos (IVA 19 %, 5 %, exento, excluido, INC). */
@Getter
@Entity
@Table(name = "taxes")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tax extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private TaxType type;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal rate;

    @Column(nullable = false)
    private boolean active;

    public static Tax create(String code, String name, TaxType type, BigDecimal rate) {
        Tax tax = new Tax();
        tax.id = Ids.newId();
        tax.code = code;
        tax.name = name;
        tax.type = type;
        tax.rate = rate;
        tax.active = true;
        return tax;
    }

    public void update(String name, BigDecimal rate) {
        this.name = name;
        this.rate = rate;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
