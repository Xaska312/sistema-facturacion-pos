package com.poshibrido.quotes.application;

import com.poshibrido.quotes.domain.QuoteConversion;
import com.poshibrido.quotes.domain.QuoteStatus;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Vistas de cotizaciones (decisión 260). {@code expired}: abierta con la fecha de validez pasada (en la zona horaria del
 * negocio). {@code convertedNumber}: el pedido (PED-n) o la venta (POS-n) en que se convirtió.
 */
public final class QuoteViews {

    private QuoteViews() {
    }

    public record ItemView(UUID id, int lineNo, UUID productId, String sku, String productName, String unitCode,
                           String description, BigDecimal width, BigDecimal length, BigDecimal quantity,
                           BigDecimal unitPrice, BigDecimal discountPercent, BigDecimal total) {
    }

    public record QuoteView(UUID id, String number, QuoteStatus status, boolean expired, UUID customerId,
                            String customerName, String customerDocument, String customerPhone, String prospectName,
                            String prospectPhone, LocalDate validUntil, String notes, String terms, BigDecimal total,
                            String createdByName, Instant createdAt, QuoteConversion convertedType, UUID convertedId,
                            String convertedNumber, Instant convertedAt, Instant rejectedAt, String rejectReason,
                            List<ItemView> items) {
    }

    /** {@code partyName}: el cliente o, si no está registrado, el prospecto. */
    public record QuoteRow(UUID id, String number, QuoteStatus status, boolean expired, UUID customerId,
                           String partyName, LocalDate validUntil, BigDecimal total, long itemCount,
                           QuoteConversion convertedType, String convertedNumber, Instant createdAt) {
    }

    /** Lo que la pantalla necesita para una cotización nueva (sin el permiso de ver Ajustes). */
    /**
     * Vigencia y condiciones por defecto (de Ajustes) y los datos del negocio para el encabezado del PDF: nombre
     * comercial y la dirección y el teléfono de la sede activa más antigua (la principal).
     */
    public record QuoteConfig(int validityDays, String terms, boolean pricesIncludeTax,
                              BigDecimal maxDiscountPercent, String businessName, String branchAddress,
                              String branchPhone) {
    }

    /** {@code saleId}: la venta registrada al vender la cotización. */
    public record SaleResult(QuoteView quote, UUID saleId) {
    }
}
