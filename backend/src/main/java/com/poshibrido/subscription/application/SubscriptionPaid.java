package com.poshibrido.subscription.application;

import java.math.BigDecimal;
import java.util.UUID;

/** Se registró un pago del plan de un negocio (decisión 312: con él cuenta un referido). Va en la misma transacción. */
public record SubscriptionPaid(UUID tenantId, BigDecimal amount) {
}
