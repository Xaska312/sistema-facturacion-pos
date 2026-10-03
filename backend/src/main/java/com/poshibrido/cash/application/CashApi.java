package com.poshibrido.cash.application;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Lo que ventas necesita de la caja. Los métodos que bloquean deben llamarse dentro de la transacción de la
 * venta o anulación, antes de bloquear inventario.
 */
public interface CashApi {

    record OpenSession(UUID id, UUID cashRegisterId, UUID branchId, UUID openedBy) {
    }

    record PaymentMethodRef(UUID id, String code, String name, boolean affectsCash, boolean requiresReference,
                            boolean active) {
    }

    /** Sesión abierta del usuario, con bloqueo compartido (el cierre espera). Vacío si no tiene caja abierta. */
    Optional<OpenSession> lockOpenSessionOf(UUID userId);

    /** La sesión indicada con bloqueo compartido, solo si sigue abierta. */
    Optional<OpenSession> lockIfOpen(UUID sessionId);

    Map<UUID, PaymentMethodRef> paymentMethods();

    /** Efectivo neto recibido por una venta (lo entregado menos el cambio). */
    void recordSaleCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);

    /** Efectivo devuelto al anular una venta ({@code amount} positivo; sale de la caja). */
    void recordVoidCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);
}
