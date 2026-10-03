package com.poshibrido.catalog.domain;

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
 * Lista de precios. La lista predeterminada (General) usa el precio del producto y sus presentaciones;
 * las demás (Mayorista, Promoción…) guardan precios propios en {@link PriceListItem}.
 */
@Getter
@Entity
@Table(name = "price_lists")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PriceList extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(name = "is_default", nullable = false, updatable = false)
    private boolean defaultList;

    @Column(nullable = false)
    private boolean active;

    public static PriceList create(String code, String name) {
        PriceList list = new PriceList();
        list.id = Ids.newId();
        list.code = code;
        list.name = name;
        list.defaultList = false;
        list.active = true;
        return list;
    }

    public void rename(String name) {
        this.name = name;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
