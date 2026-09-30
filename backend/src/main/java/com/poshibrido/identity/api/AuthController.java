package com.poshibrido.identity.api;

import com.poshibrido.identity.application.AuthService;
import com.poshibrido.identity.application.RegisterCommand;
import com.poshibrido.identity.application.SessionResult;
import com.poshibrido.identity.application.TokenService;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;
    private final RefreshCookies cookies;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserSummary register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(new RegisterCommand(request.email(), request.password(),
                request.fullName(), request.phone()));
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest request) {
        return withCookie(authService.login(request.email(), request.password()));
    }

    @PostMapping("/select-tenant")
    public ResponseEntity<SessionResponse> selectTenant(
            @Valid @RequestBody SelectTenantRequest request,
            @CookieValue(name = RefreshCookies.NAME, required = false) String currentRefresh) {
        return withCookie(authService.selectTenant(CurrentActor.requireUserId(), request.tenantId(), currentRefresh));
    }

    @PostMapping("/refresh")
    public ResponseEntity<SessionResponse> refresh(
            @CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken) {
        return withCookie(authService.refresh(refreshToken));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken) {
        authService.logout(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.clear().toString())
                .build();
    }

    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal Jwt jwt) {
        UserSummary user = authService.currentUser(CurrentActor.requireUserId());
        String tid = jwt.getClaimAsString(TokenService.CLAIM_TENANT);
        List<String> permissions = jwt.getClaimAsStringList(TokenService.CLAIM_PERMISSIONS);
        return new MeResponse(user, tid == null ? null : UUID.fromString(tid),
                permissions == null ? List.of() : permissions);
    }

    private ResponseEntity<SessionResponse> withCookie(SessionResult result) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookies.issue(result.refreshToken()).toString())
                .body(SessionResponse.of(result));
    }
}
