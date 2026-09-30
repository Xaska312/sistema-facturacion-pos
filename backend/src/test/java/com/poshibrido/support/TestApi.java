package com.poshibrido.support;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Atajos HTTP para los tests: registrar, iniciar sesión, crear y seleccionar negocio.
 */
public class TestApi {

    public static final String PASSWORD = "ClaveSegura123";
    public static final String REFRESH_COOKIE = "pos_refresh";

    private final MockMvc mvc;

    public TestApi(MockMvc mvc) {
        this.mvc = mvc;
    }

    public record Session(String accessToken, String refreshToken) {
        public String bearer() {
            return "Bearer " + accessToken;
        }

        public Cookie refreshCookie() {
            return new Cookie(REFRESH_COOKIE, refreshToken);
        }
    }

    public static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.co";
    }

    public static String uniqueSlug(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    public UUID register(String email) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"%s","fullName":"Usuario de prueba","phone":"3000000000"}
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    public ResultActions loginRaw(String email, String password) throws Exception {
        return mvc.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"email":"%s","password":"%s"}
                        """.formatted(email, password)));
    }

    public Session login(String email) throws Exception {
        return session(loginRaw(email, PASSWORD).andExpect(status().isOk()).andReturn());
    }

    public Session registerAndLogin(String prefix) throws Exception {
        String email = uniqueEmail(prefix);
        register(email);
        return login(email);
    }

    public ResultActions createTenantRaw(Session session, String slug) throws Exception {
        return mvc.perform(post("/api/v1/tenants")
                .header(HttpHeaders.AUTHORIZATION, session.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"slug":"%s","legalName":"%s S.A.S.","tradeName":"Tienda %s","businessType":"RETAIL"}
                        """.formatted(slug, slug, slug)));
    }

    public UUID createTenant(Session session, String slug) throws Exception {
        MvcResult result = createTenantRaw(session, slug).andExpect(status().isCreated()).andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.id"));
    }

    public ResultActions selectTenantRaw(Session session, UUID tenantId) throws Exception {
        return mvc.perform(post("/api/v1/auth/select-tenant")
                .header(HttpHeaders.AUTHORIZATION, session.bearer())
                .cookie(session.refreshCookie())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"tenantId":"%s"}
                        """.formatted(tenantId)));
    }

    public Session selectTenant(Session session, UUID tenantId) throws Exception {
        return session(selectTenantRaw(session, tenantId).andExpect(status().isOk()).andReturn());
    }

    public ResultActions refreshRaw(String refreshToken) throws Exception {
        return mvc.perform(post("/api/v1/auth/refresh").cookie(new Cookie(REFRESH_COOKIE, refreshToken)));
    }

    public ResultActions getWith(Session session, String path) throws Exception {
        return mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, session.bearer()));
    }

    public ResultActions postWith(Session session, String path, String json) throws Exception {
        return mvc.perform(post(path)
                .header(HttpHeaders.AUTHORIZATION, session.bearer())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    public static Session session(MvcResult result) throws Exception {
        String body = result.getResponse().getContentAsString();
        String accessToken = JsonPath.read(body, "$.accessToken");
        return new Session(accessToken, refreshCookieValue(result));
    }

    /** Extrae el valor de la cookie de refresh del encabezado Set-Cookie. */
    public static String refreshCookieValue(MvcResult result) {
        List<String> headers = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE);
        for (String header : headers) {
            if (header.startsWith(REFRESH_COOKIE + "=")) {
                int end = header.indexOf(';');
                return header.substring(REFRESH_COOKIE.length() + 1, end < 0 ? header.length() : end);
            }
        }
        throw new AssertionError("La respuesta no trae cookie " + REFRESH_COOKIE);
    }

    public static String setCookieHeader(MvcResult result) {
        return result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(h -> h.startsWith(REFRESH_COOKIE + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Sin cookie de refresh"));
    }
}
