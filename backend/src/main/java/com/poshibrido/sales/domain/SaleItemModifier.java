package com.poshibrido.sales.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.util.UUID;

/** Adición elegida en una línea de venta (Fase 12b-1), con nombre y precio congelados. Inmutable. */
@Getter
@Entity
@Immutable
@Table(name = "sale_item_modifiers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleItemModifier {

    @Id
    private UUID id;

    @Column(name = "sale_item_id", nullable = false)
    private UUID saleItemId;

    @Column(nullable = false)
    private int position;

    @Column(name = "group_name", nullable = false)
    private String groupName;

    @Column(name = "option_id")
    private UUID optionId;

    @Column(name = "option_name", nullable = false)
    private String optionName;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    public static SaleItemModifier of(UUID saleItemId, int position, String groupName, UUID optionId,
                                      String optionName, int quantity, BigDecimal unitPrice) {
        SaleItemModifier m = new SaleItemModifier();
        m.id = Ids.newId();
        m.saleItemId = saleItemId;
        m.position = position;
        m.groupName = groupName;
        m.optionId = optionId;
        m.optionName = optionName;
        m.quantity = quantity;
        m.unitPrice = unitPrice;
        return m;
    }
}
