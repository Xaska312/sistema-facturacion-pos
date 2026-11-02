package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.ProductMedicine;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ProductMedicineRepository extends JpaRepository<ProductMedicine, UUID> {
}
