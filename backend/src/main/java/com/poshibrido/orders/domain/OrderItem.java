package com.poshibrido.orders.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Línea de un pedido: un producto (o "Varios") con su descripción, por pieza o por medidas (ancho × largo en metros =
 * cantidad en m²) y el precio acordado. {@code saleId} es la venta con la que se entregó.
 */
@Getter
@Entity
@Table(name = "order_items")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderItem {

    @Id
    private UUID id;

    @Column(name = "order_id", nullable = false, updatable = false)
    private UUID orderId;

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

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(name = "sale_id")
    private UUID saleId;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    public record Data(UUID productId, String description, BigDecimal width, BigDecimal length, BigDecimal quantity,
                       BigDecimal unitPrice, BigDecimal total) {
    }

    public static OrderItem of(UUID orderId, int lineNo, Data d) {
        OrderItem item = new OrderItem();
        item.id = Ids.newId();
        item.orderId = orderId;
        item.lineNo = lineNo;
        item.apply(d);
        return item;
    }

    public void apply(Data d) {
        this.productId = d.productId();
        this.description = d.description();
        this.width = d.width();
        this.length = d.length();
        this.quantity = d.quantity();
        this.unitPrice = d.unitPrice();
        this.total = d.total();
    }

    public void renumber(int lineNo) {
        this.lineNo = lineNo;
    }

    public boolean isDelivered() {
        return saleId != null;
    }

    public void deliver(UUID saleId) {
        this.saleId = saleId;
        this.deliveredAt = Instant.now();
    }

    public void undeliver() {
        this.saleId = null;
        this.deliveredAt = null;
    }
}
