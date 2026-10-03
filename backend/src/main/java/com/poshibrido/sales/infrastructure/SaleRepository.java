package com.poshibrido.sales.infrastructure;

import com.poshibrido.sales.domain.Sale;
import com.poshibrido.sales.domain.SaleStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {

    Optional<Sale> findByIdempotencyKey(String idempotencyKey);

    /** Bloquea la venta para anularla (dos anulaciones simultáneas: la segunda ve VOIDED). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Sale s where s.id = :id")
    Optional<Sale> lockById(@Param("id") UUID id);

    @Query("""
            select s from Sale s
            where s.createdAt >= :from and s.createdAt < :to
              and (:anyBranch = true or s.branchId = :branchId)
              and (:anyStatus = true or s.status = :status)
              and (:anySession = true or s.cashSessionId = :sessionId)
              and (:anyNumber = true or s.number = :number)
              and (:anyText = true or lower(s.customerName) like :pattern escape '\\'
                   or s.customerDocumentNumber like :documentPattern escape '\\')
            order by s.createdAt desc, s.number desc
            """)
    Page<Sale> search(@Param("from") Instant from, @Param("to") Instant to,
                      @Param("anyBranch") boolean anyBranch, @Param("branchId") UUID branchId,
                      @Param("anyStatus") boolean anyStatus, @Param("status") SaleStatus status,
                      @Param("anySession") boolean anySession, @Param("sessionId") UUID sessionId,
                      @Param("anyNumber") boolean anyNumber, @Param("number") long number,
                      @Param("anyText") boolean anyText, @Param("pattern") String pattern,
                      @Param("documentPattern") String documentPattern, Pageable pageable);

    /** {@code [count, sum(total)]} de las ventas de la sesión, con un estado o todos. */
    @Query("""
            select count(s), coalesce(sum(s.total), 0) from Sale s
            where s.cashSessionId = :sessionId and (:anyStatus = true or s.status = :status)
            """)
    List<Object[]> totalsBySession(@Param("sessionId") UUID sessionId, @Param("anyStatus") boolean anyStatus,
                                   @Param("status") SaleStatus status);

    long countByVoidCashSessionId(UUID voidCashSessionId);
}
