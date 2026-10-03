package com.poshibrido.inventory.infrastructure;

import com.poshibrido.inventory.domain.StockMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    boolean existsByBranchIdAndProductId(UUID branchId, UUID productId);

    /** Kardex: más recientes primero. Usar un Pageable sin orden. */
    @Query("""
            select m from StockMovement m
            where m.productId = :productId
              and (:anyBranch = true or m.branchId = :branchId)
              and m.createdAt >= :from and m.createdAt < :to
            order by m.entryNo desc
            """)
    Page<StockMovement> kardex(@Param("productId") UUID productId, @Param("anyBranch") boolean anyBranch,
                               @Param("branchId") UUID branchId, @Param("from") Instant from,
                               @Param("to") Instant to, Pageable pageable);

    List<StockMovement> findByReferenceTypeAndReferenceIdOrderByEntryNoAsc(String referenceType, UUID referenceId);
}
