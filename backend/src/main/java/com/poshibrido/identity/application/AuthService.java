package com.poshibrido.identity.application;

import com.poshibrido.access.application.AccessApi;
import com.poshibrido.identity.domain.Membership;
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
import java.util.Optional;
import java.util.UUID;

/**
 * Casos de uso de autenticación: registro, login, selección de negocio, renovación y cierre de sesión.
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
    /** Hash señuelo para igualar tiempos cuando el correo no existe (evita enumeración de cuentas). */
    private final String dummyHash;

    public AuthService(UserRepository users, MembershipRepository memberships, RefreshTokenService refreshTokens,
                       TokenService tokens, PasswordEncoder passwordEncoder, TenantApi tenantApi,
                       AccessApi accessApi, AuthProperties properties) {
        this.users = users;
        this.memberships = memberships;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.passwordEncoder = passwordEncoder;
        this.tenantApi = tenantApi;
        this.accessApi = accessApi;
        this.properties = properties;
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
        return UserSummary.of(user);
    }

    /** Devuelve un token de plataforma (sin tenant) y la lista de negocios del usuario. */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public SessionResult login(String email, String password) {
        Instant now = Instant.now();
        User user = users.findByEmail(User.normalizeEmail(email)).orElse(null);
        if (user == null) {
            passwordEncoder.matches(password, dummyHash);
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        if (user.isLocked(now)) {
            throw new AccountLockedException(
                    "Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.");
        }
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            user.registerFailedLogin(properties.maxFailedAttempts(), properties.lockDuration(), now);
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        if (!user.isActive()) {
            throw new ForbiddenException("La cuenta no está activa.");
        }
        user.registerSuccessfulLogin();
        String refresh = refreshTokens.create(user.getId(), null);
        return new SessionResult(tokens.platformToken(user), refresh, UserSummary.of(user), null, List.of(),
                tenantApi.listVisibleTo(user.getId()));
    }

    /**
     * Emite un token de negocio tras verificar membresía activa, negocio activo y miembro activo.
     * Revoca el refresh token anterior del mismo usuario (si llegó en la cookie).
     */
    @Transactional
    public SessionResult selectTenant(UUID userId, UUID tenantId, String currentRefreshToken) {
        User user = users.findById(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException(SESSION_EXPIRED));
        TenantAccess access = resolveTenantAccess(user, tenantId)
                .orElseThrow(() -> new ForbiddenException(NO_ACCESS));
        refreshTokens.revoke(currentRefreshToken, userId);
        String refresh = refreshTokens.create(userId, tenantId);
        return new SessionResult(tokens.tenantToken(user, tenantId, access.permissions()), refresh,
                UserSummary.of(user), tenantId, access.permissions(), List.of());
    }

    /** Rota el refresh token y emite un nuevo access token del mismo tipo (plataforma o negocio). */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public SessionResult refresh(String rawRefreshToken) {
        if (rawRefreshToken == null || rawRefreshToken.isBlank()) {
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        RefreshTokenService.Rotation rotation = refreshTokens.rotate(rawRefreshToken);
        User user = users.findById(rotation.userId()).filter(User::isActive).orElse(null);
        if (user == null) {
            refreshTokens.revokeAll(rotation.userId());
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        if (rotation.tenantId() == null) {
            return new SessionResult(tokens.platformToken(user), rotation.newRawToken(), UserSummary.of(user),
                    null, List.of(), List.of());
        }
        TenantAccess access = resolveTenantAccess(user, rotation.tenantId()).orElse(null);
        if (access == null) {
            refreshTokens.revoke(rotation.newRawToken(), user.getId());
            throw new UnauthorizedException(SESSION_EXPIRED);
        }
        return new SessionResult(tokens.tenantToken(user, rotation.tenantId(), access.permissions()),
                rotation.newRawToken(), UserSummary.of(user), rotation.tenantId(), access.permissions(), List.of());
    }

    @Transactional
    public void logout(String rawRefreshToken) {
        refreshTokens.revoke(rawRefreshToken, null);
    }

    @Transactional(readOnly = true)
    public UserSummary currentUser(UUID userId) {
        return users.findById(userId)
                .map(UserSummary::of)
                .orElseThrow(() -> new UnauthorizedException(SESSION_EXPIRED));
    }

    private Optional<TenantAccess> resolveTenantAccess(User user, UUID tenantId) {
        boolean member = memberships.findByUserIdAndTenantId(user.getId(), tenantId)
                .map(Membership::isActive)
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
