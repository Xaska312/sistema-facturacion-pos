package com.poshibrido.parties.domain;

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

/** Rol de cliente de un tercero (id = parties.id). */
@Getter
@Entity
@Table(name = "customers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Customer extends AuditableEntity {

    @Id
    @Column(name = "party_id")
    private UUID partyId;

    /** Lista de precios del cliente; nula = General. */
    @Column(name = "price_list_id")
    private UUID priceListId;

    @Column(name = "credit_limit", nullable = false, precision = 14, scale = 2)
    private BigDecimal creditLimit;

    @Column(nullable = false)
    private boolean active;

    public static Customer of(UUID partyId, UUID priceListId, BigDecimal creditLimit) {
        Customer customer = new Customer();
        customer.partyId = partyId;
        customer.active = true;
        customer.update(priceListId, creditLimit);
        return customer;
    }

    public void update(UUID priceListId, BigDecimal creditLimit) {
        this.priceListId = priceListId;
        this.creditLimit = (creditLimit == null ? BigDecimal.ZERO : creditLimit).setScale(2, RoundingMode.HALF_UP);
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
