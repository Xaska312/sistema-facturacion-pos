package com.poshibrido.orders.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Pedido por encargo (tabla {@code orders}, decisión 258). No es una venta hasta que se entrega. */
@Getter
@Entity
@Table(name = "orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CustomerOrder {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String prefix;

    @Column(nullable = false, updatable = false)
    private long number;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;

    @Column(name = "customer_id", nullable = false)
    private UUID customerId;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column
    private String address;

    @Column
    private String notes;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by")
    private UUID cancelledBy;

    @Column(name = "cancel_reason")
    private String cancelReason;

    @Version
    @Column(nullable = false)
    private Long version;

    public static CustomerOrder create(String prefix, long number, UUID customerId, LocalDate dueDate, String address,
                                       String notes, BigDecimal total, UUID actor) {
        CustomerOrder order = new CustomerOrder();
        order.id = Ids.newId();
        order.prefix = prefix;
        order.number = number;
        order.status = OrderStatus.OPEN;
        order.customerId = customerId;
        order.dueDate = dueDate;
        order.address = address;
        order.notes = notes;
        order.total = total;
        order.createdBy = actor;
        order.createdAt = Instant.now();
        order.updatedBy = actor;
        order.updatedAt = order.createdAt;
        return order;
    }

    public String documentNumber() {
        return prefix + "-" + number;
    }

    public boolean isOpen() {
        return status == OrderStatus.OPEN;
    }

    public void update(LocalDate dueDate, String address, String notes, BigDecimal total, UUID actor) {
        this.dueDate = dueDate;
        this.address = address;
        this.notes = notes;
        this.total = total;
        touch(actor);
    }

    public void setTotal(BigDecimal total, UUID actor) {
        this.total = total;
        touch(actor);
    }

    /** Todo entregado. */
    public void markDelivered(UUID actor) {
        this.status = OrderStatus.DELIVERED;
        this.deliveredAt = Instant.now();
        touch(actor);
    }

    /** Se anuló la venta de una entrega: vuelve a quedar pendiente. */
    public void reopen(UUID actor) {
        this.status = OrderStatus.OPEN;
        this.deliveredAt = null;
        touch(actor);
    }

    public void cancel(String reason, UUID actor) {
        this.status = OrderStatus.CANCELLED;
        this.cancelledAt = Instant.now();
        this.cancelledBy = actor;
        this.cancelReason = reason;
        touch(actor);
    }

    private void touch(UUID actor) {
        this.updatedBy = actor;
        this.updatedAt = Instant.now();
    }
}
