package com.poshibrido.access.infrastructure;

import com.poshibrido.access.domain.Permission;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionRepository extends JpaRepository<Permission, String> {
}
