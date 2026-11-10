package com.poshibrido.catalog.infrastructure;

import com.poshibrido.catalog.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface CategoryRepository extends JpaRepository<Category, UUID> {

    boolean existsByParentId(UUID parentId);


    List<Category> findByNameIgnoreCase(String name);
}
