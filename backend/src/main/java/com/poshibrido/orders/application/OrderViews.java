package com.poshibrido.orders.application;

import com.poshibrido.orders.domain.OrderPaymentType;
import com.poshibrido.orders.domain.OrderStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Vistas de pedidos por encargo (decisión 258). Importes:
 * {@code pendingTotal} = líneas sin entregar; {@code depositAvailable} = anticipado que aún no se aplica a una
 * entrega; {@code balanceDue} = lo que falta por pagar (pendiente − anticipo disponible); {@code deposited} = anticipos
 * recibidos menos devoluciones.
 */
public final class OrderViews {

    private OrderViews() {
    }

    public record ItemView(UUID id, int lineNo, UUID productId, String sku, String productName, String unitCode,
                           String description, BigDecimal width, BigDecimal length, BigDecimal quantity,
                           BigDecimal unitPrice, BigDecimal total, boolean delivered, UUID saleId, String saleNumber,
                           Instant deliveredAt) {
    }

    public record PaymentView(UUID id, long entryNo, OrderPaymentType type, BigDecimal amount, String methodCode,
                              String methodName, String reference, String notes, UUID saleId, String saleNumber,
                              String createdByName, Instant createdAt) {
    }

    public record OrderView(UUID id, String number, OrderStatus status, UUID customerId, String customerName,
                            String customerDocument, String customerPhone, LocalDate dueDate, boolean overdue,
                            String address, String notes, BigDecimal total, BigDecimal deliveredTotal,
                            BigDecimal pendingTotal, BigDecimal deposited, BigDecimal depositAvailable,
                            BigDecimal balanceDue, String createdByName, Instant createdAt, Instant deliveredAt,
                            Instant cancelledAt, String cancelReason, List<ItemView> items,
                            List<PaymentView> payments) {
    }

    public record OrderRow(UUID id, String number, OrderStatus status, UUID customerId, String customerName,
                           LocalDate dueDate, boolean overdue, BigDecimal total, BigDecimal deposited,
                           BigDecimal balanceDue, long itemCount, long deliveredCount, Instant createdAt) {
    }

    /** Pedidos abiertos: atrasados, para hoy, próximos 3 días y lo que falta por cobrar. */
    public record Summary(long open, long overdue, long dueToday, long dueSoon, BigDecimal balanceDue) {
    }

    public record DeliveryResult(OrderView order, UUID saleId) {
    }
}
