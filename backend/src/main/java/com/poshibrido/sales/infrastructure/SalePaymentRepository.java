package com.poshibrido.sales.infrastructure;

import com.poshibrido.sales.domain.SalePayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SalePaymentRepository extends JpaRepository<SalePayment, UUID> {

    List<SalePayment> findBySaleIdOrderByLineNoAsc(UUID saleId);

    /** Cobrado por medio de pago en ventas no anuladas de la sesión: {@code [methodId, sum(amount), count]}. */
    @Query("""
            select p.paymentMethodId, coalesce(sum(p.amount), 0), count(p) from SalePayment p, Sale s
            where s.id = p.saleId and s.cashSessionId = :sessionId
              and s.status = com.poshibrido.sales.domain.SaleStatus.COMPLETED
            group by p.paymentMethodId
            """)
    List<Object[]> totalsByMethod(@Param("sessionId") UUID sessionId);
}
