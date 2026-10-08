package com.poshibrido.inventory.application;

import com.poshibrido.catalog.application.StockPresence;
import com.poshibrido.inventory.infrastructure.StockBalanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Component
@RequiredArgsConstructor
public class InventoryStockPresence implements StockPresence {

    private final StockBalanceRepository balances;

    @Override
    @Transactional(readOnly = true)
    public boolean hasStock(UUID productId) {
        return balances.existsNonZero(productId);
    }
}
