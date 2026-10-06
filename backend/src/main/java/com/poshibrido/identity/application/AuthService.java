package com.poshibrido.identity.application;

import com.poshibrido.access.application.AccessApi;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.identity.domain.User;
import com.poshibrido.identity.infrastructure.MembershipRepository;
import com.poshibrido.identity.infrastructure.UserRepository;
import com.poshibrido.shared.error.AccountLockedException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.UnauthorizedException;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantRef;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Casos de uso de autenticación: registro, login, selección de negocio, renovación y cierre de sesión.
 * Cada resultado queda en {@code platform.security_events}; entrar y salir de un negocio también en su
 * {@code audit_log} (SESSION_STARTED / SESSION_ENDED).
 */
@Slf4j
@Service
public class AuthService {

    private static final String BAD_CREDENTIALS = "Correo o contraseña incorrectos.";
    private static final String NO_ACCESS = "No tienes acceso a este negocio.";
    private static final String SESSION_EXPIRED = "La sesión expiró. Inicia sesión nuevamente.";

    private final UserRepository users;
    private final MembershipRepository memberships;
    private final RefreshTokenService refreshTokens;
    private final TokenService tokens;
    private final PasswordEncoder passwordEncoder;
    private final TenantApi tenantApi;
    private final AccessApi accessApi;
    private final AuthProperties properties;
    private final SecurityEventLogger securityEvents;
    private final AuditLogger audit;
    private final PlatformAdmins platformAdmins;
    /** Hash señuelo para igualar tiempos cuando el correo no existe (evita enumeración de cuentas). */
    private final String dummyHash;

    public AuthService(UserRepository users, MembershipRepository memberships, RefreshTokenService refreshTokens,
                       TokenService tokens, PasswordEncoder passwordEncoder, TenantApi tenantApi,
                       AccessApi accessApi, AuthProperties properties, SecurityEventLogger securityEvents,
                       AuditLogger audit, PlatformAdmins platformAdmins) {
        this.users = users;
        this.memberships = memberships;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.passwordEncoder = passwordEncoder;
        this.tenantApi = tenantApi;
        this.accessApi = accessApi;
        this.properties = properties;
        this.securityEvents = securityEvents;
        this.audit = audit;
        this.platformAdmins = platformAdmins;
        this.dummyHash = passwordEncoder.encode("dummy-password-" + UUID.randomUUID());
    }

    @Transactional
    public UserSummary register(RegisterCommand command) {
        String email = User.normalizeEmail(command.email());
        if (users.existsByEmail(email)) {
            throw new ConflictException("Ya existe una cuenta registrada con ese correo.");
        }
        User user = users.save(User.register(email, passwordEncoder.encode(command.password()),
                command.fullName(), command.phone()));
        log.info("Usuario registrado {}", user.getId());
        securityEvents.record(SecurityEvent.REGISTERED, user.getId(), email, null, null);
        return summary(user);
    }

    /**
     * Devuelve un token de plataforma (sin tenant) y la lista de negocios del usuario. Los errores no revierten la
     * transacción: el intento fallido (y el contador de intentos) debe quedar guardado.
     */
    @Transactional(noRollbackFor = {UnauthorizedException.class, AccountLockedException.class,
            ForbiddenException.class})
    public SessionResult login(String email, String password) {
        Instant now = Instant.now();
        User user = users.findByEmail(User.normalizeEmail(email)).orElse(null);
        if (user == null) {
            passwordEncoder.matches(password, dummyHash);
            loginFailed(null, email, "UNKNOWN_EMAIL");
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        if (user.isLocked(now)) {
            loginFailed(user.getId(), user.getEmail(), "LOCKED");
            throw new AccountLockedException(
                    "Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.");
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.registerFailedLogin(properties.maxFailedAttempts(), properties.lockDuration(), now);
            loginFailed(user.getId(), user.getEmail(), "BAD_PASSWORD");
            if (user.isLocked(now)) {
                securityEvents.record(SecurityEvent.ACCOUNT_LOCKED, user.getId(), user.getEmail(), null,
                        Map.of("until", user.getLockedUntil()));
            }
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        if (!user.isActive()) {
            loginFailed(user.getId(), user.getEmail(), "INACTIVE");
            throw new ForbiddenException("La cuenta no está activa.");
        }
        user.registerSuccessfulLogin();
        securityEvents.record(SecurityEvent.LOGIN_SUCCEEDED, user.getId(), user.getEmail(), null, null);
        String refresh = refreshTokens.create(user.getId(), null);
        return new SessionResult(tokens.platformToken(user), refresh, summary(user), null, List.of(),
                tenantApi.listVisibleTo(user.getId()));
    }

    /**
     * Emite un token de negocio tras verificar membresía activa, negocio activo y miembro activo.
     * Revoca el refresh token anterior del mismo usuario (si llegó en la cookie). Un acceso negado no revierte la
     * transacción (no cambió nada y el evento debe quedar guardado).
     */
    @Transactional(noRollbackFor = ForbiddenException.class)
    public SessionResult selectTenant(UUID userId, UUID tenantId, String currentRefreshToken) {
        User user = users.findById(userId)
                .filter(u -> u.isActive())
                .orElseThrow(() -> new UnauthorizedException(SESSION_EXPIRED));
        TenantAccess access = resolveTenantAccess(user, tenantId).orElse(null);
        if (access == null) {
            securityEvents.record(SecurityEvent.TENANT_ACCESS_DENIED, userId, user.getEmail(), tenantId, null);
            throw new ForbiddenException(NO_ACCESS);
        }
        refreshTokens.revoke(currentRefreshToken, userId);
        String refresh = refreshTokens.create(userId, tenantId);
        securityEvents.record(SecurityEvent.TENANT_ENTERED, userId, user.getEmail(), tenantId, null);
        audit.logIn(access.tenant().schema(), userId, "SESSION_STARTED", "session", userId, null, null);
        return new SessionResult(tokens.tenantToken(user, tenantId, access.permissions()), refresh,
                summary(user), tenantId, access.permissions(), List.of());
    }

    /** Rota el refresh token y emite un nuevo access token del mismo tipo (plataforma o negocio). */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public SessionResult refresh(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(rawRefreshToken);
        User user = users.findById(rotation.userId()).filter(u -> u.isActive()).orElse(null);
        if (user == null) {
            refreshTokens.revokeAll(rotation.userId());
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        if (rotation.tenantId() == null) {
            return new SessionResult(tokens.platformToken(user), rotation.newRawToken(), summary(user),
                    null, List.of(), List.of());
        }
        TenantAccess access = resolveTenantAccess(user, rotation.tenantId()).orElse(null);
        if (access == null) {
            refreshTokens.revoke(rotation.newRawToken(), user.getId());
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        return new SessionResult(tokens.tenantToken(user, rotation.tenantId(), access.permissions()),
                rotation.newRawToken(), summary(user), rotation.tenantId(), access.permissions(), List.of());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.revoke(rawRefreshToken, null).ifPresent(session -> {
            securityEvents.record(SecurityEvent.LOGOUT, session.userId(), null, session.tenantId(), null);
            if (session.tenantId() != null) {
                tenantApi.findActive(session.tenantId()).ifPresent(tenant ->
                        audit.logIn(tenant.schema(), session.userId(), "SESSION_ENDED", "session", session.userId(),
                                null, null));
            }
        });
    }

    @Transactional(readOnly = true)
    public UserSummary currentUser(UUID userId) {
        return users.findById(userId)
                .map(this::summary)
                .orElseThrow(() -> new UnauthorizedException(SESSION_EXPIRED));
    }

    private UserSummary summary(User user) {
        return UserSummary.of(user, platformAdmins.isAdmin(user));
    }

    /** Intento de login fallido (la transacción de login no se revierte con sus errores). */
    private void loginFailed(UUID userId, String email, String reason) {
        securityEvents.record(SecurityEvent.LOGIN_FAILED, userId, email, null, Map.of("reason", reason));
    }

    private Optional<TenantAccess> resolveTenantAccess(User user, UUID tenantId) {
        boolean member = memberships.findByUserIdAndTenantId(user.getId(), tenantId)
                .map(m -> m.isActive())
                .orElse(false);
        if (!member) {
            return Optional.empty();
        }
        return tenantApi.findActive(tenantId)
                .filter(tenant -> accessApi.isMemberActive(tenant.schema(), user.getId()))
                .map(tenant -> new TenantAccess(tenant, accessApi.permissionsOf(tenant.schema(), user.getId())));
    }

    private record TenantAccess(TenantRef tenant, List<String> permissions) {
    }
}
