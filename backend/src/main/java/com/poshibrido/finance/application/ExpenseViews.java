package com.poshibrido.finance.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Vistas de gastos para la API (decisión 320). */
public final class ExpenseViews {

    private ExpenseViews() {
    }

    public record CategoryView(UUID id, String name, boolean active, int sortOrder) {
    }

    /**
     * Un gasto. {@code unclassified}: egreso de caja de antes, sin categoría; su {@code id} es el del movimiento de
     * caja y no tiene número. {@code fromCash}: salió del efectivo de una caja. {@code cashSessionOpen}: esa caja
     * sigue abierta (un gasto en efectivo solo se anula mientras lo esté).
     */
    public record ExpenseView(UUID id, Long number, LocalDate date, UUID categoryId, String categoryName,
                              UUID branchId, String branchName, UUID supplierId, String supplierName,
                              BigDecimal amount, UUID paymentMethodId, String paymentMethodName, boolean fromCash,
                              boolean cashSessionOpen, String reference, String note, String status,
                              String voidReason, boolean unclassified, boolean hasDocument, UUID createdBy,
                              String createdByName, Instant createdAt) {
    }

    public record CategoryTotal(UUID categoryId, String name, BigDecimal total, long count) {
    }

    public record MethodTotal(UUID paymentMethodId, String name, BigDecimal total, long count) {
    }

    /**
     * Totales de los gastos activos del filtro. {@code byCategory} va de mayor a menor; los egresos sin clasificar
     * salen como una categoría sin id llamada "Sin clasificar".
     */
    public record Summary(LocalDate from, LocalDate to, BigDecimal total, long count, BigDecimal cashTotal,
                          BigDecimal otherTotal, long unclassifiedCount, BigDecimal unclassifiedTotal,
                          List<CategoryTotal> byCategory, List<MethodTotal> byMethod) {
    }

    public record StoredFile(String fileName, String contentType, byte[] content) {
    }
}
