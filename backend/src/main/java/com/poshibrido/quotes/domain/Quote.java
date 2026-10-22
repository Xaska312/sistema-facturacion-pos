package com.poshibrido.quotes.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Cotización (tabla {@code quotes}, decisión 260): una propuesta de precios para un cliente registrado o para un
 * prospecto (nombre y teléfono). No mueve inventario ni dinero hasta que se convierte en pedido o en venta.
 */
@Getter
@Entity
@Table(name = "quotes")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Quote {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String prefix;

    @Column(nullable = false, updatable = false)
    private long number;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private QuoteStatus status;

    @Column(name = "customer_id")
    private UUID customerId;

    @Column(name = "prospect_name")
    private String prospectName;

    @Column(name = "prospect_phone")
    private String prospectPhone;

    @Column(name = "valid_until", nullable = false)
    private LocalDate validUntil;

    @Column
    private String notes;

    @Column
    private String terms;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(name = "created_by", nullable = false, updatable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "converted_type")
    private QuoteConversion convertedType;

    @Column(name = "converted_id")
    private UUID convertedId;

    @Column(name = "converted_at")
    private Instant convertedAt;

    @Column(name = "converted_by")
    private UUID convertedBy;

    @Column(name = "rejected_at")
    private Instant rejectedAt;

    @Column(name = "rejected_by")
    private UUID rejectedBy;

    @Column(name = "reject_reason")
    private String rejectReason;

    @Version
    @Column(nullable = false)
    private Long version;

    /** Para quién es: un cliente registrado o, si no, un prospecto con nombre (y teléfono opcional). */
    public record Party(UUID customerId, String prospectName, String prospectPhone) {
    }

    public static Quote create(String prefix, long number, Party party, LocalDate validUntil, String notes,
                               String terms, BigDecimal total, UUID actor) {
        Quote quote = new Quote();
        quote.id = Ids.newId();
        quote.prefix = prefix;
        quote.number = number;
        quote.status = QuoteStatus.OPEN;
        quote.setParty(party);
        quote.validUntil = validUntil;
        quote.notes = notes;
        quote.terms = terms;
        quote.total = total;
        quote.createdBy = actor;
        quote.createdAt = Instant.now();
        quote.updatedBy = actor;
        quote.updatedAt = quote.createdAt;
        return quote;
    }

    public String documentNumber() {
        return prefix + "-" + number;
    }

    public boolean isOpen() {
        return status == QuoteStatus.OPEN;
    }

    public void update(Party party, LocalDate validUntil, String notes, String terms, BigDecimal total, UUID actor) {
        setParty(party);
        this.validUntil = validUntil;
        this.notes = notes;
        this.terms = terms;
        this.total = total;
        touch(actor);
    }

    /** El prospecto se registró como cliente al convertir la cotización. */
    public void assignCustomer(UUID customerId, UUID actor) {
        this.customerId = customerId;
        touch(actor);
    }

    public void accept(QuoteConversion type, UUID convertedId, UUID actor) {
        this.status = QuoteStatus.ACCEPTED;
        this.convertedType = type;
        this.convertedId = convertedId;
        this.convertedAt = Instant.now();
        this.convertedBy = actor;
        touch(actor);
    }

    public void reject(String reason, UUID actor) {
        this.status = QuoteStatus.REJECTED;
        this.rejectedAt = Instant.now();
        this.rejectedBy = actor;
        this.rejectReason = reason;
        touch(actor);
    }

    private void setParty(Party party) {
        this.customerId = party.customerId();
        this.prospectName = party.customerId() == null ? party.prospectName() : null;
        this.prospectPhone = party.customerId() == null ? party.prospectPhone() : null;
    }

    private void touch(UUID actor) {
        this.updatedBy = actor;
        this.updatedAt = Instant.now();
    }
}
