package com.poshibrido.sales.domain;

import com.poshibrido.shared.id.Ids;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.util.UUID;

/** Pago de una venta. {@code tendered} es lo entregado; {@code amount}, lo aplicado (sin el cambio). Inmutable. */
@Getter
@Entity
@Immutable
@Table(name = "sale_payments")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SalePayment {

    @Id
    private UUID id;

    @Column(name = "sale_id", nullable = false)
    private UUID saleId;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "payment_method_id", nullable = false)
    private UUID paymentMethodId;

    @Column(name = "method_code", nullable = false)
    private String methodCode;

    @Column(name = "affects_cash", nullable = false)
    private boolean affectsCash;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal tendered;

    @Column
    private String reference;

    public static SalePayment of(UUID saleId, int lineNo, UUID paymentMethodId, String methodCode, boolean affectsCash,
                                 BigDecimal amount, BigDecimal tendered, String reference) {
        SalePayment p = new SalePayment();
        p.id = Ids.newId();
        p.saleId = saleId;
        p.lineNo = lineNo;
        p.paymentMethodId = paymentMethodId;
        p.methodCode = methodCode;
        p.affectsCash = affectsCash;
        p.amount = amount;
        p.tendered = tendered;
        p.reference = reference;
        return p;
    }
}
