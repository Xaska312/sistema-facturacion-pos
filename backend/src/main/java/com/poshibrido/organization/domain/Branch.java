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

/**
 * Sucursal. Tabla del schema del tenant (sin schema explícito: lo resuelve el search_path).
 */
@Getter
@Entity
@Table(name = "branches")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Branch extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column
    private String address;

    @Column(name = "city_code")
    private String cityCode;

    @Column
    private String phone;

    @Column(nullable = false)
    private boolean active;

    public static Branch create(String code, String name, String address, String cityCode, String phone) {
        Branch branch = new Branch();
        branch.id = Ids.newId();
        branch.code = code;
        branch.name = name;
        branch.address = address;
        branch.cityCode = cityCode;
        branch.phone = phone;
        branch.active = true;
        return branch;
    }

    public void update(String name, String address, String cityCode, String phone) {
        this.name = name;
        this.address = address;
        this.cityCode = cityCode;
        this.phone = phone;
    }

    public void deactivate() {
        this.active = false;
    }

    public void activate() {
        this.active = true;
    }
}
