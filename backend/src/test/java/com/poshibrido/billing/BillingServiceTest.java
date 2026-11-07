package com.poshibrido.billing;

import com.poshibrido.billing.application.BillingServiceAccess;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Cómo Aska compara el comprobante con el pedido (decisión 302). */
class BillingServiceTest {

    @Test
    void acceptsTheHolderNameOrTheKeyAndAnyCaseOrAccents() {
        var check = BillingServiceAccess.compare(Map.of("readable", true, "amount", 69900, "reference",
                        "pago xk3hp9ac mensual", "date", "2026-11-06", "destination", "DANIEL MEJIA M", "successful", true),
                "XK3HP9AC", new BigDecimal("69900.00"), Instant.parse("2026-11-06T15:00:00Z"), "@XASKAPOS", "Daniel Mejía");
        assertThat(check.allOk()).isTrue();
        var wrong = BillingServiceAccess.compare(Map.of("readable", true, "amount", 69000, "reference", "",
                        "date", "2026-11-01", "destination", "Pedro Pérez", "successful", false),
                "XK3HP9AC", new BigDecimal("69900"), Instant.parse("2026-11-06T15:00:00Z"), "@XASKAPOS", "Daniel Mejía");
        assertThat(wrong.allOk()).isFalse();
        assertThat(wrong.note()).contains("exitosa").contains("valor").contains("XK3HP9AC").contains("llave")
                .contains("anterior");
    }
}
