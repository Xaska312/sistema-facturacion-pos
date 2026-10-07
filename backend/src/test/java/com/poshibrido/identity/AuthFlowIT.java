package com.poshibrido.identity;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthFlowIT extends IntegrationTest {

    @Test
    void loginReturnsPlatformTokenWithoutTenantAndHttpOnlyRefreshCookie() throws Exception {
        String email = TestApi.uniqueEmail("login");
        api.register(email);

        MvcResult result = api.loginRaw(email, TestApi.PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.tenantId").doesNotExist())
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andExpect(jsonPath("$.tenants").isArray())
                .andReturn();

        String accessToken = JsonPath.read(result.getResponse().getContentAsString(), "$.accessToken");
        String payload = new String(Base64.getUrlDecoder().decode(accessToken.split("\\.")[1]));
        assertThat(payload).doesNotContain("\"tid\"").contains("\"typ\":\"platform\"");

        String cookie = TestApi.setCookieHeader(result);
        assertThat(cookie).contains("HttpOnly").contains("Secure").contains("SameSite=Strict")
                .contains("Path=/api/v1/auth");
    }

    @Test
    void duplicateEmailIsConflict() throws Exception {
        String email = TestApi.uniqueEmail("dup2");
        api.register(email);
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s","fullName":"Otro"}
                                """.formatted(email, TestApi.PASSWORD)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.title").value("Conflicto"));

        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"corta","fullName":"Otro"}
                                """.formatted(TestApi.uniqueEmail("weak"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$..field", org.hamcrest.Matchers.hasItem("password")));
    }

    @Test
    void wrongPasswordIsUnauthorizedAndLocksAfterFiveAttempts() throws Exception {
        String email = TestApi.uniqueEmail("lock");
        api.register(email);

        for (int i = 0; i < 5; i++) {
            api.loginRaw(email, "ClaveEquivocada1").andExpect(status().isUnauthorized());
        }
        // Bloqueado: incluso con la contraseña correcta
        api.loginRaw(email, TestApi.PASSWORD).andExpect(status().isLocked());

        Integer locked = jdbc.queryForObject(
                "SELECT count(*) FROM platform.users WHERE email = ? AND locked_until > now()", Integer.class, email);
        assertThat(locked).isEqualTo(1);
    }

    @Test
    void unknownEmailGetsSameMessageAsWrongPassword() throws Exception {
        String unknown = api.loginRaw(TestApi.uniqueEmail("nadie"), TestApi.PASSWORD)
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        String email = TestApi.uniqueEmail("real");
        api.register(email);
        String wrong = api.loginRaw(email, "OtraClave12345")
                .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertThat((String) JsonPath.read(unknown, "$.detail")).isEqualTo(JsonPath.read(wrong, "$.detail"));
    }

    @Test
    void refreshRotatesTokenAndReuseRevokesAllSessions() throws Exception {
        Session session = api.registerAndLogin("rot");

        MvcResult first = api.refreshRaw(session.refreshToken()).andExpect(status().isOk()).andReturn();
        String rotated = TestApi.refreshCookieValue(first);
        assertThat(rotated).isNotEqualTo(session.refreshToken());

        // Reutilizarlo en seguida = otra pestaña del mismo navegador: 401, pero la sesión nueva sigue viva (QA SEG-5)
        api.refreshRaw(session.refreshToken()).andExpect(status().isUnauthorized());
        MvcResult second = api.refreshRaw(rotated).andExpect(status().isOk()).andReturn();
        String latest = TestApi.refreshCookieValue(second);

        // Reutilizar un token viejo pasado el margen = posible robo: 401 y se revoca toda la familia
        api.ageRefreshRotations();
        api.refreshRaw(session.refreshToken()).andExpect(status().isUnauthorized());
        api.refreshRaw(latest).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesRefreshToken() throws Exception {
        Session session = api.registerAndLogin("logout");
        MvcResult result = mvc.perform(post("/api/v1/auth/logout").cookie(session.refreshCookie()))
                .andExpect(status().isNoContent())
                .andReturn();
        assertThat(TestApi.setCookieHeader(result)).contains("Max-Age=0");
        api.refreshRaw(session.refreshToken()).andExpect(status().isUnauthorized());
    }

    @Test
    void refreshWithoutCookieIsUnauthorized() throws Exception {
        mvc.perform(post("/api/v1/auth/refresh")).andExpect(status().isUnauthorized());
    }

    @Test
    void protectedEndpointsRequireValidToken() throws Exception {
        mvc.perform(get("/api/v1/tenants")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/tenants").header(HttpHeaders.AUTHORIZATION, "Bearer no.es.valido"))
                .andExpect(status().isUnauthorized());

        Session session = api.registerAndLogin("me");
        api.getWith(session, "/api/v1/auth/me")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").doesNotExist())
                .andExpect(jsonPath("$.permissions").isEmpty());
    }
}
