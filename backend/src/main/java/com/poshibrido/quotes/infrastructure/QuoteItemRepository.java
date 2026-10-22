package com.poshibrido.quotes.infrastructure;

import com.poshibrido.quotes.domain.QuoteItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface QuoteItemRepository extends JpaRepository<QuoteItem, UUID> {

    List<QuoteItem> findByQuoteIdOrderByLineNoAsc(UUID quoteId);
}
