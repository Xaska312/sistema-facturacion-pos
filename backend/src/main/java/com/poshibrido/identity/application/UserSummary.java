package com.poshibrido.identity.application;

import com.poshibrido.identity.domain.User;

import java.util.UUID;

public record UserSummary(UUID id, String email, String fullName, boolean platformAdmin) {

    public static UserSummary of(User user) {
        return new UserSummary(user.getId(), user.getEmail(), user.getFullName(), user.isPlatformAdmin());
    }
}
