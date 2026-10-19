package com.poshibrido.credit.infrastructure;

import com.poshibrido.credit.domain.CreditEntry;
import com.poshibrido.credit.domain.CreditEntryType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CreditEntryRepository extends JpaRepository<CreditEntry, UUID> {

    Optional<CreditEntry> findByIdempotencyKey(String idempotencyKey);

    Optional<CreditEntry> findBySaleIdAndType(UUID saleId, CreditEntryType type);

    Optional<CreditEntry> findByPaymentIdAndType(UUID paymentId, CreditEntryType type);
}
