package com.poshibrido.identity.api;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SelectTenantRequest(@NotNull UUID tenantId) {
}
