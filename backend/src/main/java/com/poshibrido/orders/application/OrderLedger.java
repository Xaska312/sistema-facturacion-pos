package com.poshibrido.orders.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.orders.domain.CustomerOrder;
import com.poshibrido.orders.domain.OrderItem;
import com.poshibrido.orders.domain.OrderPayment;
import com.poshibrido.orders.domain.OrderPaymentType;
import com.poshibrido.orders.domain.OrderStatus;
import com.poshibrido.orders.infrastructure.OrderItemRepository;
import com.poshibrido.orders.infrastructure.OrderPaymentRepository;
import com.poshibrido.orders.infrastructure.OrderRepository;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Implementación de {@link OrderApi}: reversa de una entrega cuando se anula su venta. Un pedido entregado se reabre;
 * uno cancelado sigue cancelado y su anticipo vuelto a quedar disponible se devuelve aparte.
 */
@Component
@RequiredArgsConstructor
public class OrderLedger implements OrderApi {

    private final OrderRepository orders;
    private final OrderItemRepository items;
    private final OrderPaymentRepository payments;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void saleVoided(UUID saleId) {
        List<UUID> orderIds = items.orderIdsBySale(saleId);
        if (orderIds.isEmpty()) {
            return;
        }
        UUID actor = CurrentActor.userId().orElse(null);
        CustomerOrder order = orders.lock(orderIds.getFirst()).orElseThrow();
        // Pedido cancelado: las líneas vuelven a quedar sin entregar (canceladas con el pedido) y lo aplicado vuelve al
        // anticipo disponible, que se devuelve con "Devolver anticipo" (cancel sobre el pedido cancelado).
        List<OrderItem> delivered = items.findBySaleId(saleId);
        delivered.forEach(OrderItem::undeliver);
        payments.findBySaleIdAndType(saleId, OrderPaymentType.APPLIED).ifPresent(applied -> {
            if (payments.findBySaleIdAndType(saleId, OrderPaymentType.APPLIED_VOID).isEmpty()) {
                em.persist(OrderPayment.record(new OrderPayment.Data(order.getId(), OrderPaymentType.APPLIED_VOID,
                        applied.getAmount().negate(), applied.getPaymentMethodId(), applied.getMethodCode(), null,
                        null, null, saleId, null, actor)));
            }
        });
        if (order.getStatus() == OrderStatus.DELIVERED) {
            order.reopen(actor);
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("saleId", saleId);
        after.put("items", delivered.size());
        audit.log("ORDER_DELIVERY_VOIDED", "order", order.getId(), null, after);
    }
}
