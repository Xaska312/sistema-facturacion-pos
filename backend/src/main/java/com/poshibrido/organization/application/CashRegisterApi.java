package com.poshibrido.organization.application;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Cajas registradoras del negocio actual para otros módulos (caja y ventas). */
public interface CashRegisterApi {

    /** Caja con los datos de su sucursal. {@code usable} = caja y sucursal activas. */
    record RegisterRef(UUID id, String code, String name, boolean active, UUID branchId, String branchCode,
                       String branchName, boolean branchActive) {

        public boolean usable() {
            return active && branchActive;
        }
    }

    Optional<RegisterRef> find(UUID id);

    /** Todas las cajas (activas o no) ordenadas por sucursal y código. */
    List<RegisterRef> all();
}
