package com.poshibrido.identity.application;

import java.time.Instant;

public record IssuedToken(String value, Instant expiresAt, long expiresInSeconds) {
}
