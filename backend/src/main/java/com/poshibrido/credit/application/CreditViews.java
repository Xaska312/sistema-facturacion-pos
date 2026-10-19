package com.poshibrido.credit.application;

import com.poshibrido.credit.domain.CreditEntryType;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Vistas del fiado para la API (decisión 255). */
public final class CreditViews {

    private CreditViews() {
    }

    /**
     * Cuenta de fiado de un cliente. {@code balance} positivo = debe; negativo = saldo a favor. {@code available}:
     * lo que todavía se le puede fiar sin pasar el cupo. La deuda por antigüedad reparte el saldo entre las ventas
     * fiadas más recientes (los abonos pagan primero lo más viejo); {@code oldestDebtAt} es la fecha de la venta
     * pendiente más antigua.
     */
    public record AccountView(UUID customerId, String name, String documentType, String formattedDocument,
                              String phone, boolean active, BigDecimal creditLimit, BigDecimal balance,
                              BigDecimal available, Instant oldestDebtAt, BigDecimal upTo30Days,
                              BigDecimal from31To60Days, BigDecimal over60Days, Instant lastPaymentAt,
                              BigDecimal lastPaymentAmount) {
    }

    /** Totales de la cartera: lo que deben todos los clientes, por antigüedad. */
    public record Summary(BigDecimal totalBalance, long customers, BigDecimal upTo30Days, BigDecimal from31To60Days,
                          BigDecimal over60Days, long overLimit) {
    }

    /**
     * Movimiento del estado de cuenta, con el saldo después de él. En un abono, {@code voided} indica si se anuló
     * (y {@code voidReason} por qué); en una anulación de abono, {@code paymentId} es el abono anulado y
     * {@code notes} el motivo.
     */
    public record EntryView(UUID id, long entryNo, CreditEntryType type, BigDecimal amount, BigDecimal balanceAfter,
                            UUID saleId, String saleNumber, UUID paymentId, String methodCode, String methodName,
                            String reference, String notes, String createdByName, Instant createdAt, boolean voided,
                            String voidReason, Instant voidedAt) {
    }
}
