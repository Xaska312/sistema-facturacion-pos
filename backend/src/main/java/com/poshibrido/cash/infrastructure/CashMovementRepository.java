package com.poshibrido.cash.infrastructure;

import com.poshibrido.cash.domain.CashMovement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CashMovementRepository extends JpaRepository<CashMovement, UUID> {

    List<CashMovement> findByCashSessionIdOrderByEntryNoAsc(UUID cashSessionId);

    Optional<CashMovement> findByIdempotencyKey(String idempotencyKey);

    @Query("select coalesce(sum(m.amount), 0) from CashMovement m where m.cashSessionId = :sessionId")
    BigDecimal sumBySession(@Param("sessionId") UUID sessionId);

    /** Totales por tipo: filas {@code [CashMovementType, BigDecimal, Long]}. */
    @Query("""
            select m.type, coalesce(sum(m.amount), 0), count(m) from CashMovement m
            where m.cashSessionId = :sessionId group by m.type
            """)
    List<Object[]> totalsByType(@Param("sessionId") UUID sessionId);
}
