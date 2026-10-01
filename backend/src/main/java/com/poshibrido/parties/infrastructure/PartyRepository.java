package com.poshibrido.parties.infrastructure;

import com.poshibrido.parties.domain.DocumentType;
import com.poshibrido.parties.domain.Party;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PartyRepository extends JpaRepository<Party, UUID> {

    Optional<Party> findByDocumentTypeAndDocumentNumber(DocumentType documentType, String documentNumber);
}
