package com.poshibrido.sales.application;

import java.time.Instant;
import java.util.UUID;

/** Evento publicado al anular una venta (dentro de su transacción). */
public record SaleVoided(UUID tenantId, UUID saleId, String prefix, long number, String reason, Instant occurredAt) {
}
