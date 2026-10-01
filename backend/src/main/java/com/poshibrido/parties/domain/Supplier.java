package com.poshibrido.parties.domain;

import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.UUID;

/** Rol de proveedor de un tercero (id = parties.id). */
@Getter
@Entity
@Table(name = "suppliers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Supplier extends AuditableEntity {

    @Id
    @Column(name = "party_id")
    private UUID partyId;

    @Column(nullable = false)
    private boolean active;

    public static Supplier of(UUID partyId) {
        Supplier supplier = new Supplier();
        supplier.partyId = partyId;
        supplier.active = true;
        return supplier;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
