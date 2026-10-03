package com.poshibrido.parties.application;

import com.poshibrido.parties.domain.Party;
import com.poshibrido.parties.infrastructure.CustomerRepository;
import com.poshibrido.parties.infrastructure.PartyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CustomerDirectory implements CustomerApi {

    private final CustomerRepository customers;
    private final PartyRepository parties;

    @Override
    @Transactional(readOnly = true)
    public Optional<CustomerRef> find(UUID customerId) {
        return customers.findById(customerId).flatMap(c -> parties.findById(c.getPartyId()).map(p -> toRef(p,
                c.getPriceListId(), c.isActive())));
    }

    private static CustomerRef toRef(Party p, UUID priceListId, boolean active) {
        return new CustomerRef(p.getId(), p.getDocumentType().name(), p.getDocumentNumber(), p.getVerificationDigit(),
                p.displayName(), priceListId, active);
    }
}
