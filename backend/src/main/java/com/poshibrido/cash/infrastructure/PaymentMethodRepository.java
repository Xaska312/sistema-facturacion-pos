package com.poshibrido.cash.infrastructure;

import com.poshibrido.cash.domain.PaymentMethod;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PaymentMethodRepository extends JpaRepository<PaymentMethod, UUID> {

    List<PaymentMethod> findAllByOrderBySortOrderAscNameAsc();
}
