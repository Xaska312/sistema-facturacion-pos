package com.poshibrido.tenancy.application;

import com.poshibrido.tenancy.domain.BusinessType;

public record CreateTenantCommand(String slug, String legalName, String tradeName, BusinessType businessType) {
}
