package com.poshibrido.subscription;

import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Planes por nivel (decisión 288): Emprende, Negocio y Empresa incluyen módulos, funciones y límites distintos; el
 * administrador le da extras a un negocio desde la consola; los planes anteriores conservan todo.
 */
class PlansIT extends IntegrationTest {

    @Test
    void planDecidesModulesFeaturesAndLimitsAndTheAdminGivesExtras() throws Exception {
        Session admin = platformAdmin();
        api.getWith(admin, "/api/v1/platform/plans")
                .andExpect(jsonPath("$[0].code").value("EMPRENDE"))
                .andExpect(jsonPath("$[0].monthlyPrice").value(34900.0))
                .andExpect(jsonPath("$[2].code").value("EMPRESA"))
                .andExpect(jsonPath("$[3].legacy").value(true));

        Owned owner = api.newTenant("planes");
        Session s = owner.tenant();
        // La prueba corre con Empresa: todo incluido.
        api.getWith(s, "/api/v1/audit").andExpect(status().isOk());
        api.getWith(s, "/api/v1/subscription").andExpect(jsonPath("$.plan.code").value("EMPRESA"))
                .andExpect(jsonPath("$.entitled.features", hasItem("AUDIT")));

        // Pasa a Emprende: sin auditoría ni compras, sin mesas, 1 caja y 2 usuarios.
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/plan".formatted(owner.tenantId()),
                "{\"planCode\":\"EMPRENDE\"}").andExpect(status().isOk());
        s = renew(s);
        api.getWith(s, "/api/v1/audit").andExpect(status().isForbidden());
        api.getWith(s, "/api/v1/purchases").andExpect(status().isForbidden());
        api.getWith(s, "/api/v1/business-profile").andExpect(jsonPath("$.planName").value("Emprende"))
                .andExpect(jsonPath("$.allowedModules", hasItem("CREDIT")))
                .andExpect(jsonPath("$.allowedModules", not(hasItem("TABLES"))));
        api.putWith(s, "/api/v1/business-profile", "{\"businessType\":\"RESTAURANT\",\"modules\":[\"TABLES\"]}")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("plan Emprende")));
        UUID branch = api.principalBranchId(s);
        String register = "{\"branchId\":\"%s\",\"code\":\"C2\",\"name\":\"Caja 2\"}".formatted(branch);
        api.postWith(s, "/api/v1/cash-registers", register).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("1 caja activa")));
        api.joinAs(s, owner.tenantId(), "CASHIER");
        api.inviteRaw(s, TestApi.uniqueEmail("tercero"), api.roleId(s, "CASHIER"), branch).andExpect(status().is(422));

        // El administrador le da Mesas, auditoría y una caja de más (con fecha de fin pasada, no).
        String extras = "/api/v1/platform/tenants/%s/subscription/extras".formatted(owner.tenantId());
        api.putWith(admin, extras, "{\"modules\":[\"TABLES\"],\"features\":[\"AUDIT\"],\"branches\":0,\"registers\":1,"
                + "\"users\":0,\"until\":\"2020-01-01T00:00:00Z\"}").andExpect(status().is(422));
        api.putWith(admin, extras, "{\"modules\":[\"NOPE\"],\"features\":[],\"branches\":0,\"registers\":0,\"users\":0}")
                .andExpect(status().is(422));
        api.putWith(admin, extras, """
                {"modules":["TABLES"],"features":["AUDIT"],"branches":0,"registers":1,"users":0,
                 "note":"Piloto del restaurante"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entitled.maxRegisters").value(2))
                .andExpect(jsonPath("$.entitled.modules", hasItem("TABLES")))
                .andExpect(jsonPath("$.extras.note").value("Piloto del restaurante"));
        s = renew(s);
        api.getWith(s, "/api/v1/audit").andExpect(status().isOk());
        api.getWith(s, "/api/v1/purchases").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/cash-registers", register).andExpect(status().isCreated());
        api.putWith(s, "/api/v1/business-profile", "{\"businessType\":\"RESTAURANT\",\"modules\":[\"TABLES\"]}")
                .andExpect(status().isOk());
        // El negocio ve sus extras, pero no la nota interna.
        api.getWith(s, "/api/v1/subscription").andExpect(jsonPath("$.extras.modules", hasItem("TABLES")))
                .andExpect(jsonPath("$.extras.note").doesNotExist());
        api.getWith(admin, "/api/v1/platform/security-events?event=SUBSCRIPTION_EXTRAS_CHANGED&size=5")
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[*].tenantId", hasItem(owner.tenantId().toString())));
    }

    @Test
    void legacyPlansKeepEverything() throws Exception {
        Session admin = platformAdmin();
        Owned owner = api.newTenant("anterior");
        api.putWith(admin, "/api/v1/platform/tenants/%s/subscription/plan".formatted(owner.tenantId()),
                "{\"planCode\":\"BASIC\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.entitled.features", hasItem("AUDIT")))
                .andExpect(jsonPath("$.plan.legacy").value(true));
        Session s = renew(owner.tenant());
        api.getWith(s, "/api/v1/audit").andExpect(status().isOk());
        new PosTestSupport(api);
    }

    private Session renew(Session s) throws Exception {
        return TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
    }
}
