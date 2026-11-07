package com.poshibrido.billing.application;

import com.poshibrido.billing.application.BillingService.Breb;
import com.poshibrido.billing.application.BillingService.ProofCheck;
import com.poshibrido.billing.application.BillingService.RequestView;
import com.poshibrido.subscription.domain.BillingCycle;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Acceso de prueba a la comparación del comprobante. */
public final class BillingServiceAccess {

    private BillingServiceAccess() {
    }

    public static ProofCheck compare(Map<String, Object> read, String reference, BigDecimal amount, Instant createdAt,
                                     String key, String holder) {
        RequestView r = new RequestView(null, null, null, reference, "PENDING", null, null, BillingCycle.MONTHLY, 1, 1,
                BigDecimal.ZERO, List.of(), amount, createdAt, createdAt, null, null, null, null, null);
        return BillingService.compare(read, r, new Breb(key, holder, "", "", true));
    }
}
