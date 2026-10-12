package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.SizeScale;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SizeScaleRepository extends JpaRepository<SizeScale, UUID> {

    boolean existsByCode(String code);
}
