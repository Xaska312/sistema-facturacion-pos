package com.poshibrido.inventory.infrastructure;

import com.poshibrido.inventory.domain.InventoryDocumentLine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InventoryDocumentLineRepository extends JpaRepository<InventoryDocumentLine, UUID> {

    List<InventoryDocumentLine> findByDocumentIdOrderByLineNo(UUID documentId);
}
