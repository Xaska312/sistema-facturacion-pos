package com.poshibrido.identity;

import com.poshibrido.identity.domain.User;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class UserLockingTest {

    @Test
    void locksAfterMaxAttemptsAndUnlocksAfterDuration() {
        User user = User.register("  Ana@Correo.CO ", "hash", "Ana", null);
        assertThat(user.getEmail()).isEqualTo("ana@correo.co");

        Instant now = Instant.parse("2026-01-01T10:00:00Z");
        for (int i = 0; i < 4; i++) {
            user.registerFailedLogin(5, Duration.ofMinutes(15), now);
        }
        assertThat(user.isLocked(now)).isFalse();
        user.registerFailedLogin(5, Duration.ofMinutes(15), now);
        assertThat(user.isLocked(now)).isTrue();
        assertThat(user.isLocked(now.plus(Duration.ofMinutes(16)))).isFalse();

        user.registerSuccessfulLogin();
        assertThat(user.getFailedAttempts()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }
}
