package com.poshibrido.identity.domain;

import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.persistence.AuditableEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * Identidad global. Una persona tiene una sola cuenta y puede pertenecer a varios negocios.
 */
@Getter
@Entity
@Table(name = "users", schema = "platform")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends AuditableEntity {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status;

    /** Superadministrador de la plataforma: solo se asigna manualmente en BD, nunca por registro. */
    @Column(name = "platform_admin", nullable = false)
    private boolean platformAdmin;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    /** Cuándo confirmó su correo (nulo = sin confirmar). */
    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    public static User register(String email, String passwordHash, String fullName, String phone) {
        User user = new User();
        user.id = Ids.newId();
        user.email = normalizeEmail(email);
        user.passwordHash = passwordHash;
        user.fullName = fullName.trim();
        user.phone = phone == null || phone.isBlank() ? null : phone.trim();
        user.status = UserStatus.ACTIVE;
        user.platformAdmin = false;
        user.failedAttempts = 0;
        return user;
    }

    public static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    public boolean isActive() {
        return status == UserStatus.ACTIVE;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    /** Registra un intento fallido y bloquea temporalmente al llegar al máximo. */
    public void registerFailedLogin(int maxAttempts, Duration lockDuration, Instant now) {
        failedAttempts++;
        if (failedAttempts >= maxAttempts) {
            lockedUntil = now.plus(lockDuration);
            failedAttempts = 0;
        }
    }

    public void registerSuccessfulLogin() {
        failedAttempts = 0;
        lockedUntil = null;
    }

    public boolean isEmailVerified() {
        return emailVerifiedAt != null;
    }

    /** Confirma el correo (abrió el enlace del correo, aceptó una invitación enviada a él o restableció la clave). */
    public void markEmailVerified(Instant now) {
        if (emailVerifiedAt == null) {
            emailVerifiedAt = now;
        }
    }

    /** Nueva contraseña (ya hasheada): también desbloquea la cuenta. */
    public void changePassword(String newPasswordHash) {
        this.passwordHash = newPasswordHash;
        this.failedAttempts = 0;
        this.lockedUntil = null;
    }
}
