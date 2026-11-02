package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Al desactivar a un miembro su sesión abierta deja de servir de inmediato, sin esperar a que venza el token de acceso
 * (decisión 277; hallazgo 2 de las pruebas de seguridad, decisión 276). Al activarlo de nuevo vuelve a entrar.
 */
class MemberDeactivationIT extends IntegrationTest {

    @Test
    void deactivatedMemberIsCutOffImmediately() throws Exception {
        Owned owner = api.newTenant("corte");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");
        api.getWith(cashier.session(), "/api/v1/products").andExpect(status().isOk());

        api.postEmpty(owner.tenant(), "/api/v1/members/%s/deactivate".formatted(cashier.userId()))
                .andExpect(status().isOk());
        api.getWith(cashier.session(), "/api/v1/products").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail", containsString("desactivado")));
        api.postWith(cashier.session(), "/api/v1/cash/sessions", "{}").andExpect(status().isUnauthorized());
        api.refreshRaw(cashier.session().refreshToken()).andExpect(status().isUnauthorized());
        // El dueño sigue trabajando.
        api.getWith(owner.tenant(), "/api/v1/products").andExpect(status().isOk());

        api.postEmpty(owner.tenant(), "/api/v1/members/%s/activate".formatted(cashier.userId()))
                .andExpect(status().isOk());
        api.getWith(api.selectTenant(api.login(cashier.email()), owner.tenantId()), "/api/v1/products")
                .andExpect(status().isOk());
    }
}
