package com.poshibrido.identity.application;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.application.UserTokenService.Purpose;
import com.poshibrido.identity.domain.User;
import com.poshibrido.identity.infrastructure.UserRepository;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.TooManyRequestsException;
import com.poshibrido.shared.error.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Cuenta por correo: confirmar el correo y restablecer la contraseña olvidada. Los correos salen después de
 * confirmar la transacción ({@link Mailer}).
 */
@Service
@RequiredArgsConstructor
public class AccountService {

    /** Mínimo entre dos correos del mismo tipo para la misma cuenta. */
    static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private final UserRepository users;
    private final UserTokenService tokens;
    private final Mailer mailer;
    private final MailTemplates templates;
    private final PasswordEncoder passwordEncoder;
    private final RefreshTokenService refreshTokens;
    private final SecurityEventLogger securityEvents;

    // ---------------------------------------------------------------- confirmar correo

    /** Envía el enlace para confirmar el correo (al registrarse). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void sendVerification(User user) {
        String token = tokens.issue(user.getId(), Purpose.VERIFY_EMAIL);
        mailer.send(templates.verifyEmail(user.getEmail(), user.getFullName(), token));
    }

    /** "Reenviar correo": nada si ya está confirmado; 429 si se pidió hace menos de un minuto. */
    @Transactional
    public void resendVerification(UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("La sesión expiró. Inicia sesión nuevamente."));
        if (user.isEmailVerified()) {
            return;
        }
        if (recentlyIssued(userId, Purpose.VERIFY_EMAIL)) {
            throw new TooManyRequestsException("Ya te enviamos un correo hace un momento. Espera un minuto para pedir otro.");
        }
        sendVerification(user);
    }

    @Transactional
    public void verifyEmail(String rawToken) {
        UUID userId = tokens.consume(rawToken, Purpose.VERIFY_EMAIL);
        User user = users.findById(userId).orElseThrow(() -> new BusinessRuleException(UserTokenService.INVALID));
        if (!user.isEmailVerified()) {
            user.markEmailVerified(Instant.now());
            securityEvents.record(SecurityEvent.EMAIL_VERIFIED, userId, user.getEmail(), null, null);
        }
    }

    // ---------------------------------------------------------------- contraseña olvidada

    /**
     * Siempre responde igual (exista o no la cuenta): no revela qué correos están registrados. Si la cuenta existe
     * y está activa, envía el enlace (máximo uno por minuto).
     */
    @Transactional
    public void requestPasswordReset(String email) {
        String normalized = User.normalizeEmail(email);
        User user = users.findByEmail(normalized).filter(User::isActive).orElse(null);
        securityEvents.record(SecurityEvent.PASSWORD_RESET_REQUESTED, user == null ? null : user.getId(), normalized,
                null, null);
        if (user == null || recentlyIssued(user.getId(), Purpose.RESET_PASSWORD)) {
            return;
        }
        String token = tokens.issue(user.getId(), Purpose.RESET_PASSWORD);
        mailer.send(templates.passwordReset(user.getEmail(), user.getFullName(), token));
    }

    /**
     * Nueva contraseña con el enlace del correo: desbloquea la cuenta, da el correo por confirmado (abrió el enlace
     * que llegó a él), cierra todas las sesiones y avisa por correo.
     */
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        UUID userId = tokens.consume(rawToken, Purpose.RESET_PASSWORD);
        User user = users.findById(userId).filter(User::isActive)
                .orElseThrow(() -> new BusinessRuleException(UserTokenService.INVALID));
        Instant now = Instant.now();
        user.changePassword(passwordEncoder.encode(newPassword));
        user.markEmailVerified(now);
        refreshTokens.revokeAll(userId);
        securityEvents.record(SecurityEvent.PASSWORD_RESET, userId, user.getEmail(), null, null);
        mailer.send(templates.passwordChanged(user.getEmail(), user.getFullName(), now));
    }

    private boolean recentlyIssued(UUID userId, Purpose purpose) {
        return tokens.lastIssuedAt(userId, purpose)
                .map(last -> last.isAfter(Instant.now().minus(RESEND_COOLDOWN)))
                .orElse(false);
    }
}
