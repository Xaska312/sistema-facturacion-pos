package com.poshibrido.cash.application;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Resumen de ventas de una sesión para el informe de cierre. Lo implementa el módulo de ventas (la caja no
 * depende de ventas).
 */
public interface SessionSalesSummary {

    record MethodTotal(UUID paymentMethodId, String code, String name, BigDecimal amount, long count) {
    }

    /**
     * @param salesCount   ventas registradas en la sesión (incluidas las anuladas después)
     * @param voidedCount  de esas, las anuladas
     * @param byMethod     cobrado por medio de pago en ventas no anuladas
     * @param voidsHereCount anulaciones cuyo efectivo se devolvió en esta sesión (de esta u otras sesiones)
     */
    record Summary(long salesCount, BigDecimal salesTotal, long voidedCount, BigDecimal voidedTotal,
                   List<MethodTotal> byMethod, long voidsHereCount) {

        public BigDecimal netSales() {
            return salesTotal.subtract(voidedTotal);
        }
    }

    Summary summarize(UUID cashSessionId);
}
