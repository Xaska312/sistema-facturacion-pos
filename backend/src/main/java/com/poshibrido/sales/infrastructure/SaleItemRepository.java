package com.poshibrido.sales.infrastructure;

import com.poshibrido.sales.domain.SaleItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SaleItemRepository extends JpaRepository<SaleItem, UUID> {

    List<SaleItem> findBySaleIdOrderByLineNoAsc(UUID saleId);
}
