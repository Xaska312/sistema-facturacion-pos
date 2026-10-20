package com.poshibrido.orders.infrastructure;

import com.poshibrido.orders.domain.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface OrderItemRepository extends JpaRepository<OrderItem, UUID> {

    List<OrderItem> findByOrderIdOrderByLineNoAsc(UUID orderId);

    List<OrderItem> findBySaleId(UUID saleId);

    @Query("select distinct i.orderId from OrderItem i where i.saleId = :saleId")
    List<UUID> orderIdsBySale(@Param("saleId") UUID saleId);
}
