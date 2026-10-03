package com.poshibrido.cash.application;

import com.poshibrido.shared.security.CurrentActor;

/** Permisos de caja de la petición actual. */
final class CashAccess {

    static final String READ = "cash:read";
    static final String AUDIT = "cash:audit";

    private CashAccess() {
    }

    /** Ve el efectivo esperado y las diferencias (el cajero cuenta a ciegas). */
    static boolean canAudit() {
        return CurrentActor.permissions().contains(AUDIT);
    }

    static boolean canReadAll() {
        return CurrentActor.permissions().contains(READ);
    }
}
