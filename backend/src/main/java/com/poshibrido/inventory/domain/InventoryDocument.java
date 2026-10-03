package com.poshibrido.inventory.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

/** Encabezado de un documento de inventario. Inmutable una vez registrado. */
@Getter
@Entity
@Immutable
@Table(name = "inventory_documents")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InventoryDocument {

    @Id
    private UUID id;

    @Column(nullable = false)
    private long number;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InventoryDocumentType type;

    @Column(name = "branch_id", nullable = false)
    private UUID branchId;

    @Column(name = "target_branch_id")
    private UUID targetBranchId;

    @Column
    private String reason;

    @Column
    private String notes;

    @Column(name = "idempotency_key")
    private String idempotencyKey;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public static InventoryDocument create(long number, InventoryDocumentType type, UUID branchId, UUID targetBranchId,
                                           String reason, String notes, String idempotencyKey, UUID createdBy) {
        InventoryDocument d = new InventoryDocument();
        d.id = Ids.newId();
        d.number = number;
        d.type = type;
        d.branchId = branchId;
        d.targetBranchId = targetBranchId;
        d.reason = reason;
        d.notes = notes;
        d.idempotencyKey = idempotencyKey;
        d.createdBy = createdBy;
        d.createdAt = Instant.now();
        return d;
    }
}
