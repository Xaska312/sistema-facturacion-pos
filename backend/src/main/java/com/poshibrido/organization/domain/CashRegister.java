package com.poshibrido.organization.domain;

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

/** Caja registradora de una sucursal. */
@Getter
@Entity
@Table(name = "cash_registers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CashRegister extends AuditableEntity {

    @Id
    private UUID id;

    @Column(name = "branch_id", nullable = false, updatable = false)
    private UUID branchId;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private boolean active;

    public static CashRegister create(UUID branchId, String code, String name) {
        CashRegister register = new CashRegister();
        register.id = Ids.newId();
        register.branchId = branchId;
        register.code = code;
        register.name = name;
        register.active = true;
        return register;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void deactivate() {
        this.active = false;
    }

    public void activate() {
        this.active = true;
    }
}
