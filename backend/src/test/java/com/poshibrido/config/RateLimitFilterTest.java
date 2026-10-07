package com.poshibrido.config;

import com.poshibrido.audit.application.SecurityEventLogger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** QA SEG-3: el límite por IP no se evita codificando la ruta. */
class RateLimitFilterTest {

    private static final HandlerExceptionResolver RESOLVER = (request, response, handler, ex) -> {
        response.setStatus(429);
        return new ModelAndView();
    };

    private final RateLimitFilter filter = new RateLimitFilter(new RateLimitProperties(2, 1, 100, 10), RESOLVER,
            mock(SecurityEventLogger.class));

    private int post(String uri, String ip) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void encodedOrSlashedPathsShareTheLoginLimit() throws Exception {
        assertThat(post("/api/v1/auth/login", "10.0.0.1")).isEqualTo(200);
        assertThat(post("/api/v1/auth/%6Cogin", "10.0.0.1")).isEqualTo(200);
        assertThat(post("/api/v1/auth/login/", "10.0.0.1")).isEqualTo(429);
        assertThat(post("/api/v1/auth/l%6fgin;x=1", "10.0.0.1")).isEqualTo(429);
        // Otra IP tiene su propio contador.
        assertThat(post("/api/v1/auth/login", "10.0.0.2")).isEqualTo(200);
    }

    @Test
    void normalizesTheRequestPath() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/%72egister/");
        assertThat(RequestPaths.normalized(request)).isEqualTo("/api/v1/auth/register");
    }
}
