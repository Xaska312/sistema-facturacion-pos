package com.poshibrido.config;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class ApiRateLimitFilterTest {

    /** Responde 429 como lo haría el manejador global (sin levantar Spring). */
    private static final HandlerExceptionResolver RESOLVER = (request, response, handler, ex) -> {
        response.setStatus(429);
        return new ModelAndView();
    };

    private final SecurityEventLogger events = mock(SecurityEventLogger.class);
    private final ApiRateLimitFilter filter = new ApiRateLimitFilter(
            new RateLimitProperties(10, 5, 3, 1), RESOLVER, events);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void limitsEachUserSeparately() throws Exception {
        UUID ana = UUID.randomUUID();
        UUID beto = UUID.randomUUID();
        for (int i = 0; i < 3; i++) {
            assertThat(call(ana, "/api/v1/products")).isEqualTo(200);
        }
        MockHttpServletResponse rejected = response(ana, "/api/v1/products");
        assertThat(rejected.getStatus()).isEqualTo(429);
        assertThat(rejected.getHeader("Retry-After")).isNotNull();
        assertThat(call(beto, "/api/v1/products")).isEqualTo(200);

        // Solo el primer rechazo de la ventana queda en los eventos de seguridad.
        assertThat(call(ana, "/api/v1/products")).isEqualTo(429);
        verify(events, times(1)).record(eq(SecurityEvent.RATE_LIMITED), eq(ana), isNull(), isNull(), any());
    }

    @Test
    void heavyOperationsHaveTheirOwnLowerLimit() throws Exception {
        UUID user = UUID.randomUUID();
        assertThat(call(user, "/api/v1/reports/sales.csv")).isEqualTo(200);
        assertThat(call(user, "/api/v1/audit/export.csv")).isEqualTo(429);
        assertThat(call(user, "/api/v1/products")).isEqualTo(200);
    }

    @Test
    void withoutSessionCountsByIpAndIgnoresNonApiPaths() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertThat(call(null, "/api/v1/auth/login")).isEqualTo(200);
        }
        assertThat(call(null, "/api/v1/auth/login")).isEqualTo(429);
        assertThat(call(null, "/actuator/health")).isEqualTo(200);
    }

    @Test
    void recognizesHeavyPaths() {
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/reports/sales/by-day.csv")).isTrue();
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/audit/export.csv")).isTrue();
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/products/import")).isTrue();
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/tenants/" + UUID.randomUUID() + "/close")).isTrue();
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/products")).isFalse();
        assertThat(ApiRateLimitFilter.isHeavy("/api/v1/sales")).isFalse();
    }

    private int call(UUID user, String path) throws Exception {
        return response(user, path).getStatus();
    }

    private MockHttpServletResponse response(UUID user, String path) throws Exception {
        if (user == null) {
            SecurityContextHolder.clearContext();
        } else {
            Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(user.toString())
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        }
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        request.setRemoteAddr("10.0.0.7");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response;
    }
}
