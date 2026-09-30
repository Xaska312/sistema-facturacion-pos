package com.poshibrido.identity.api;

import com.poshibrido.identity.application.UserSummary;

import java.util.List;
import java.util.UUID;

public record MeResponse(UserSummary user, UUID tenantId, List<String> permissions) {
}
