package com.poshibrido.inventory.infrastructure;

import com.poshibrido.inventory.domain.InventoryDocument;
import com.poshibrido.inventory.domain.InventoryDocumentType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

public interface InventoryDocumentRepository extends JpaRepository<InventoryDocument, UUID> {

    Optional<InventoryDocument> findByIdempotencyKey(String idempotencyKey);

    /** Documentos más recientes primero; filtros opcionales por tipo y sucursal (origen o destino). */
    @Query("""
            select d from InventoryDocument d
            where (:anyType = true or d.type = :type)
              and (:anyBranch = true or d.branchId = :branchId or d.targetBranchId = :branchId)
            order by d.createdAt desc, d.number desc
            """)
    Page<InventoryDocument> search(@Param("anyType") boolean anyType, @Param("type") InventoryDocumentType type,
                                   @Param("anyBranch") boolean anyBranch, @Param("branchId") UUID branchId,
                                   Pageable pageable);

    @Transactional
    @Query(value = "SELECT nextval('inventory_document_seq')", nativeQuery = true)
    long nextNumber();
}
