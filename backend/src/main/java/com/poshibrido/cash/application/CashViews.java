package com.poshibrido.cash.application;

import com.poshibrido.cash.application.SessionSalesSummary.MethodTotal;
import com.poshibrido.cash.domain.CashMovementType;
import com.poshibrido.cash.domain.CashSessionStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Vistas de caja para la API. El esperado y la diferencia solo se incluyen con el permiso cash:audit. */
public final class CashViews {

    private CashViews() {
    }

    public record PaymentMethodView(UUID id, String code, String name, boolean affectsCash,
                                    boolean requiresReference) {
    }

    /** Caja que el usuario puede abrir; {@code busy} si ya tiene una sesión abierta (de quien sea). */
    public record RegisterOption(UUID id, String code, String name, UUID branchId, String branchName, boolean busy,
                                 String busyBy) {
    }

    public record SessionView(UUID id, UUID cashRegisterId, String registerCode, String registerName, UUID branchId,
                              String branchName, CashSessionStatus status, UUID openedBy, String openedByName,
                              Instant openedAt, BigDecimal openingAmount, String openingNotes, Instant closedAt,
                              UUID closedBy, String closedByName, BigDecimal countedAmount,
                              BigDecimal expectedAmount, BigDecimal difference, String closingNotes, boolean mine) {
    }

    public record MovementView(Long entryNo, UUID id, CashMovementType type, BigDecimal amount, String reason,
                               String referenceType, UUID referenceId, UUID createdBy, String createdByName,
                               Instant createdAt) {
    }

    /**
     * Efectivo de la sesión. Sin el permiso cash:audit (cierre ciego) solo se informan la base y lo contado: el
     * desglose, el esperado y la diferencia son nulos. {@code counted} es nulo mientras la sesión está abierta.
     */
    public record CashSection(BigDecimal opening, BigDecimal sales, BigDecimal voidRefunds, BigDecimal incomes,
                              BigDecimal expenses, BigDecimal withdrawals, BigDecimal expected, BigDecimal counted,
                              BigDecimal difference) {
    }

    /** Informe de cierre (Z) o parcial (X) si la sesión sigue abierta. */
    public record SessionReport(SessionView session, long salesCount, BigDecimal salesTotal, long voidedCount,
                                BigDecimal voidedTotal, BigDecimal netSales, List<MethodTotal> byMethod,
                                long voidsHereCount, CashSection cash, boolean auditView) {
    }
}
