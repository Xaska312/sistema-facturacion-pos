package com.poshibrido.quotes.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Línea de una cotización: un producto con su descripción, por cantidad o por medidas (ancho × largo en metros =
 * cantidad en m²), el precio cotizado y un descuento en %. El total se calcula como en la venta.
 */
@Getter
@Entity
@Table(name = "quote_items")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuoteItem {

    @Id
    private UUID id;

    @Column(name = "quote_id", nullable = false, updatable = false)
    private UUID quoteId;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column
    private String description;

    @Column(precision = 10, scale = 3)
    private BigDecimal width;

    @Column(precision = 10, scale = 3)
    private BigDecimal length;

    @Column(nullable = false, precision = 14, scale = 4)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "discount_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal discountPercent;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    public record Data(UUID productId, String description, BigDecimal width, BigDecimal length, BigDecimal quantity,
                       BigDecimal unitPrice, BigDecimal discountPercent, BigDecimal total) {
    }

    public static QuoteItem of(UUID quoteId, int lineNo, Data d) {
        QuoteItem item = new QuoteItem();
        item.id = Ids.newId();
        item.quoteId = quoteId;
        item.lineNo = lineNo;
        item.productId = d.productId();
        item.description = d.description();
        item.width = d.width();
        item.length = d.length();
        item.quantity = d.quantity();
        item.unitPrice = d.unitPrice();
        item.discountPercent = d.discountPercent();
        item.total = d.total();
        return item;
    }
}
