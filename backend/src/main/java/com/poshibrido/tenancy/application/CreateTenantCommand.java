package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.BusinessType;

/** {@code activationCode}: opcional; sin él, prueba gratis (fase 8b). */
public record CreateTenantCommand(String slug, String legalName, String tradeName, BusinessType businessType,
                                  String activationCode) {
}
