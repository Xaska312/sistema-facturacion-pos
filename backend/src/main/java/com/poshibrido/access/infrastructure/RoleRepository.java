package com.poshibrido.access.infrastructure;

import com.poshibrido.access.domain.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface RoleRepository extends JpaRepository<Role, UUID> {

    boolean existsByCode(String code);
}
