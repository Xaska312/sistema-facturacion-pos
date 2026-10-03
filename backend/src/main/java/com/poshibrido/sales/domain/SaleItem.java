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

/** Línea de venta con los datos del producto, precio e impuesto copiados al vender. Inmutable. */
@Getter
@Entity
@Immutable
@Table(name = "sale_items")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleItem {

    @Id
    private UUID id;

    @Column(name = "sale_id", nullable = false)
    private UUID saleId;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(nullable = false)
    private String sku;

    @Column(nullable = false)
    private String name;

    @Column(name = "unit_id", nullable = false)
    private UUID unitId;

    @Column(name = "unit_code", nullable = false)
    private String unitCode;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal quantity;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal factor;

    @Column(name = "base_quantity", nullable = false, precision = 14, scale = 4)
    private BigDecimal baseQuantity;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "gross_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal grossAmount;

    @Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPercent;

    @Column(name = "discount_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal discountAmount;

    @Column(name = "tax_id", nullable = false)
    private UUID taxId;

    @Column(name = "tax_type", nullable = false)
    private String taxType;

    @Column(name = "tax_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal taxRate;

    @Column(name = "taxable_base", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxableBase;

    @Column(name = "tax_amount", nullable = false, precision = 14, scale = 2)
    private BigDecimal taxAmount;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(name = "unit_cost", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitCost;

    @Column(name = "track_inventory", nullable = false)
    private boolean trackInventory;

    public record Data(UUID saleId, int lineNo, UUID productId, String sku, String name, UUID unitId, String unitCode,
                       BigDecimal quantity, BigDecimal factor, BigDecimal baseQuantity, BigDecimal unitPrice,
                       BigDecimal grossAmount, BigDecimal discountPercent, BigDecimal discountAmount, UUID taxId,
                       String taxType, BigDecimal taxRate, BigDecimal taxableBase, BigDecimal taxAmount,
                       BigDecimal total, BigDecimal unitCost, boolean trackInventory) {
    }

    public static SaleItem of(Data d) {
        SaleItem i = new SaleItem();
        i.id = Ids.newId();
        i.saleId = d.saleId();
        i.lineNo = d.lineNo();
        i.productId = d.productId();
        i.sku = d.sku();
        i.name = d.name();
        i.unitId = d.unitId();
        i.unitCode = d.unitCode();
        i.quantity = d.quantity();
        i.factor = d.factor();
        i.baseQuantity = d.baseQuantity();
        i.unitPrice = d.unitPrice();
        i.grossAmount = d.grossAmount();
        i.discountPercent = d.discountPercent();
        i.discountAmount = d.discountAmount();
        i.taxId = d.taxId();
        i.taxType = d.taxType();
        i.taxRate = d.taxRate();
        i.taxableBase = d.taxableBase();
        i.taxAmount = d.taxAmount();
        i.total = d.total();
        i.unitCost = d.unitCost();
        i.trackInventory = d.trackInventory();
        return i;
    }
}
