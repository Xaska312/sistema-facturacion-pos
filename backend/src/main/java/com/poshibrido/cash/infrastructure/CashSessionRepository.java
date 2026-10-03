package com.poshibrido.cash.infrastructure;

import com.poshibrido.cash.domain.CashSession;
import com.poshibrido.cash.domain.CashSessionStatus;
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

public interface CashSessionRepository extends JpaRepository<CashSession, UUID> {

    Optional<CashSession> findByOpenedByAndStatus(UUID openedBy, CashSessionStatus status);

    List<CashSession> findByStatus(CashSessionStatus status);

    /**
     * Bloqueo compartido de la sesión abierta del usuario: las ventas y anulaciones lo toman para que el
     * cierre (que bloquea en exclusiva) espere a que terminen. Si el cierre gana, la fila ya no cumple
     * {@code status = 'OPEN'} y no se devuelve nada.
     */
    @Query(value = "SELECT id FROM cash_sessions WHERE opened_by = :userId AND status = 'OPEN' FOR SHARE",
            nativeQuery = true)
    List<UUID> lockOpenOf(@Param("userId") UUID userId);

    /** Igual que {@link #lockOpenOf}, para una sesión concreta. */
    @Query(value = "SELECT id FROM cash_sessions WHERE id = :id AND status = 'OPEN' FOR SHARE", nativeQuery = true)
    List<UUID> lockIfOpen(@Param("id") UUID id);

    /** Bloqueo exclusivo para cerrar la sesión. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from CashSession s where s.id = :id")
    Optional<CashSession> lockForClose(@Param("id") UUID id);

    @Query("""
            select s from CashSession s
            where (:anyRegister = true or s.cashRegisterId = :registerId)
              and (:anyBranch = true or s.branchId = :branchId)
              and (:anyStatus = true or s.status = :status)
              and (:anyUser = true or s.openedBy = :userId)
              and s.openedAt >= :from and s.openedAt < :to
            order by s.openedAt desc
            """)
    Page<CashSession> search(@Param("anyRegister") boolean anyRegister, @Param("registerId") UUID registerId,
                             @Param("anyBranch") boolean anyBranch, @Param("branchId") UUID branchId,
                             @Param("anyStatus") boolean anyStatus, @Param("status") CashSessionStatus status,
                             @Param("anyUser") boolean anyUser, @Param("userId") UUID userId,
                             @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
}
