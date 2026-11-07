package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.BusinessType;

/**
 * {@code activationCode}: opcional; sin él, prueba gratis (fase 8b). {@code payNow} (decisión 303): quien ya usó su
 * prueba puede crear el negocio para pagarlo de una vez (queda solo con Planes y pagos hasta que se apruebe el pago).
 */
public record CreateTenantCommand(String slug, String legalName, String tradeName, BusinessType businessType,
                                  String activationCode, boolean payNow) {

    public CreateTenantCommand(String slug, String legalName, String tradeName, BusinessType businessType,
                               String activationCode) {
        this(slug, legalName, tradeName, businessType, activationCode, false);
    }
}
