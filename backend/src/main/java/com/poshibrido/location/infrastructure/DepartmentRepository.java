package com.poshibrido.location.infrastructure;

import com.poshibrido.location.domain.Department;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DepartmentRepository extends JpaRepository<Department, String> {
}
