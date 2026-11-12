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

    /**
     * La sesión abierta de una caja (la abriera quien la abriera), con bloqueo compartido. Vacío si está cerrada. Para
     * las zonas de mesas con caja propia (decisión 285).
     */
    Optional<OpenSession> lockOpenSessionOfRegister(UUID cashRegisterId);

    /** La sesión indicada con bloqueo compartido, solo si sigue abierta. */
    Optional<OpenSession> lockIfOpen(UUID sessionId);

    Map<UUID, PaymentMethodRef> paymentMethods();

    /** Efectivo neto recibido por una venta (lo entregado menos el cambio). */
    void recordSaleCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);

    /** Efectivo devuelto al anular una venta ({@code amount} positivo; sale de la caja). */
    void recordVoidCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);

    /** Abono en efectivo de un cliente a su fiado ({@code amount} positivo; entra a la caja). */
    void recordCreditPaymentCash(UUID sessionId, BigDecimal amount, UUID entryId, String label);

    /** Efectivo devuelto al anular un abono ({@code amount} positivo; sale de la caja). */
    void recordCreditPaymentVoidCash(UUID sessionId, BigDecimal amount, UUID entryId, String label);

    /** Anticipo en efectivo de un pedido ({@code amount} positivo; entra a la caja). */
    void recordOrderPaymentCash(UUID sessionId, BigDecimal amount, UUID paymentId, String label);

    /** Devolución en efectivo del anticipo de un pedido ({@code amount} positivo; sale de la caja). */
    void recordOrderRefundCash(UUID sessionId, BigDecimal amount, UUID paymentId, String label);

    /** Propina en efectivo de una venta (Fase 12b-5; {@code amount} positivo; entra a la caja). */
    void recordTipCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);

    /** Propina en efectivo devuelta al anular la venta ({@code amount} positivo; sale de la caja). */
    void recordTipVoidCash(UUID sessionId, BigDecimal amount, UUID saleId, String label);

    /** Entrega de propinas al equipo desde la caja ({@code amount} positivo; sale de la caja). */
    void recordTipPayoutCash(UUID sessionId, BigDecimal amount, UUID payoutId, String label);

    /**
     * Pago en efectivo a un proveedor (Fase 13-2) desde la caja abierta de quien paga: la bloquea para salidas y exige
     * que haya ese efectivo (sin decir cuánto hay: cierre ciego). Devuelve la sesión de caja.
     */
    UUID recordSupplierPaymentCash(UUID actorId, BigDecimal amount, UUID paymentId, String label);

    /**
     * Gasto en efectivo (decisión 320) desde la caja abierta de quien lo registra (la suya o la compartida donde
     * vende): la bloquea para salidas y exige que haya ese efectivo (sin decir cuánto hay: cierre ciego). Devuelve la
     * sesión de caja.
     */
    OpenSession recordExpenseCash(UUID actorId, BigDecimal amount, UUID expenseId, String label);

    /**
     * Devuelve a la caja el efectivo de un gasto anulado ({@code amount} positivo). Solo si esa sesión sigue abierta;
     * si ya se cerró, falla con un mensaje para el usuario.
     */
    void recordExpenseVoidCash(UUID sessionId, BigDecimal amount, UUID expenseId, String label);
}
