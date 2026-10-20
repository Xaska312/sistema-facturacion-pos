package com.poshibrido.orders.infrastructure;

import com.poshibrido.orders.domain.OrderPayment;
import com.poshibrido.orders.domain.OrderPaymentType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderPaymentRepository extends JpaRepository<OrderPayment, UUID> {

    List<OrderPayment> findByOrderIdOrderByEntryNoAsc(UUID orderId);

    Optional<OrderPayment> findByIdempotencyKey(String idempotencyKey);

    Optional<OrderPayment> findBySaleIdAndType(UUID saleId, OrderPaymentType type);

    /** Anticipo disponible: anticipos − devoluciones − aplicado + aplicado anulado. */
    @Query("select coalesce(sum(p.amount), 0) from OrderPayment p where p.orderId = :orderId")
    BigDecimal available(@Param("orderId") UUID orderId);
}
