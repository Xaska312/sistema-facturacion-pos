package com.poshibrido.credit.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Saldo de fiado de un cliente (positivo = debe; negativo = saldo a favor). Se bloquea la fila al fiar, abonar o
 * anular, así el cupo no se pasa con dos ventas a la vez. El saldo es siempre la suma de sus {@link CreditEntry}.
 */
@Getter
@Entity
@Table(name = "credit_accounts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CreditAccount {

    @Id
    @Column(name = "customer_id")
    private UUID customerId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal balance;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public void apply(CreditEntry entry) {
        if (!entry.getCustomerId().equals(customerId)) {
            throw new IllegalArgumentException("El movimiento es de otro cliente");
        }
        balance = balance.add(entry.getAmount());
        updatedAt = Instant.now();
    }
}
