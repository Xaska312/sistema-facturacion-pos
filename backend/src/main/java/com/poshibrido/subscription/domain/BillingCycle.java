package com.poshibrido.subscription.domain;

/** Ciclo de cobro de la suscripción. */
public enum BillingCycle {
    MONTHLY(1),
    ANNUAL(12);

    private final int months;

    BillingCycle(int months) {
        this.months = months;
    }

    public int months() {
        return months;
    }
}
