package com.poshibrido.sales.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Evento publicado al registrar una venta (dentro de su transacción). La emisión electrónica futura lo escuchará
 * con {@code @TransactionalEventListener(phase = AFTER_COMMIT)}.
 */
public record SaleCompleted(UUID tenantId, UUID saleId, String prefix, long number, UUID customerId,
                            BigDecimal total, Instant occurredAt) {
}
