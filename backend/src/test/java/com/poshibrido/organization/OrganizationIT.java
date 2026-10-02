package com.poshibrido.organization;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Sucursales, cajas, ajustes del negocio y catálogo DIVIPOLA. */
class OrganizationIT extends IntegrationTest {

    @Test
    void branchLifecycle() throws Exception {
        Owned owner = api.newTenant("org");
        UUID principal = api.principalBranchId(owner.tenant());

        api.putWith(owner.tenant(), "/api/v1/branches/" + principal, """
                {"name":"Sede centro","address":"Calle 10 # 5-20","cityCode":"05001","phone":"6045550000"}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Sede centro"))
                .andExpect(jsonPath("$.code").value("PRINCIPAL"))
                .andExpect(jsonPath("$.cityCode").value("05001"));
        api.putWith(owner.tenant(), "/api/v1/branches/" + principal, """
                {"name":"Sede centro","cityCode":"99999"}
                """).andExpect(status().is(422));

        // No se puede desactivar la única sucursal activa
        api.postEmpty(owner.tenant(), "/api/v1/branches/" + principal + "/deactivate").andExpect(status().is(422));

        String body = api.postWith(owner.tenant(), "/api/v1/branches", """
                {"code":"sur","name":"Sede sur","cityCode":"11001"}
                """).andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUR"))
                .andReturn().getResponse().getContentAsString();
        UUID south = UUID.fromString(JsonPath.read(body, "$.id"));

        api.postEmpty(owner.tenant(), "/api/v1/branches/" + south + "/deactivate")
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        api.postEmpty(owner.tenant(), "/api/v1/branches/" + south + "/activate")
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        api.getWith(owner.tenant(), "/api/v1/branches/" + south).andExpect(jsonPath("$.name").value("Sede sur"));
        api.getWith(owner.tenant(), "/api/v1/branches/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void cashRegisterLifecycle() throws Exception {
        Owned owner = api.newTenant("cajas");
        UUID principal = api.principalBranchId(owner.tenant());

        api.getWith(owner.tenant(), "/api/v1/cash-registers?branchId=" + principal)
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].code").value("CAJA-1"));

        String body = api.postWith(owner.tenant(), "/api/v1/cash-registers", """
                {"branchId":"%s","code":"caja-2","name":"Caja rápida"}
                """.formatted(principal)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("CAJA-2"))
                .andReturn().getResponse().getContentAsString();
        UUID registerId = UUID.fromString(JsonPath.read(body, "$.id"));

        api.postWith(owner.tenant(), "/api/v1/cash-registers", """
                {"branchId":"%s","code":"CAJA-2","name":"Repetida"}
                """.formatted(principal)).andExpect(status().isConflict());
        api.postWith(owner.tenant(), "/api/v1/cash-registers", """
                {"branchId":"%s","code":"CAJA-3","name":"Sin sede"}
                """.formatted(UUID.randomUUID())).andExpect(status().is(422));

        api.putWith(owner.tenant(), "/api/v1/cash-registers/" + registerId, """
                {"name":"Caja express"}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Caja express"));
        api.postEmpty(owner.tenant(), "/api/v1/cash-registers/" + registerId + "/deactivate")
                .andExpect(jsonPath("$.active").value(false));
    }

    @Test
    void settingsAreReadValidatedAndAudited() throws Exception {
        Owned owner = api.newTenant("ajustes");
        api.getWith(owner.tenant(), "/api/v1/settings")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allowNegativeStock").value(false))
                .andExpect(jsonPath("$.pricesIncludeTax").value(true))
                .andExpect(jsonPath("$.timezone").value("America/Bogota"))
                .andExpect(jsonPath("$.currency").value("COP"));

        api.putWith(owner.tenant(), "/api/v1/settings", """
                {"allowNegativeStock":true,"pricesIncludeTax":false,"timezone":"America/Bogota",
                 "currency":"COP","receiptFooter":"Vuelva pronto","maxDiscountPercent":15.5}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.allowNegativeStock").value(true))
                .andExpect(jsonPath("$.receiptFooter").value("Vuelva pronto"));

        assertThat(jdbc.queryForObject("SELECT setting_value FROM t_" + owner.slug()
                + ".business_settings WHERE setting_key = 'max_discount_percent'", String.class)).isEqualTo("15.50");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM t_" + owner.slug()
                + ".audit_log WHERE action = 'SETTINGS_UPDATED'", Integer.class)).isEqualTo(1);

        api.putWith(owner.tenant(), "/api/v1/settings", """
                {"allowNegativeStock":true,"pricesIncludeTax":false,"timezone":"Marte/Olympus",
                 "currency":"COP","receiptFooter":"","maxDiscountPercent":0}
                """).andExpect(status().is(422));
        api.putWith(owner.tenant(), "/api/v1/settings", """
                {"allowNegativeStock":true,"pricesIncludeTax":false,"timezone":"America/Bogota",
                 "currency":"USD","receiptFooter":"","maxDiscountPercent":0}
                """).andExpect(status().is(422));
        api.putWith(owner.tenant(), "/api/v1/settings", """
                {"allowNegativeStock":true,"pricesIncludeTax":false,"timezone":"America/Bogota",
                 "currency":"COP","receiptFooter":"","maxDiscountPercent":150}
                """).andExpect(status().isBadRequest());
    }

    @Test
    void divipolaCatalogIsAvailableToAnyAuthenticatedUser() throws Exception {
        Owned owner = api.newTenant("divipola");
        String departments = api.getWith(owner.platform(), "/api/v1/locations/departments")
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> codes = JsonPath.read(departments, "$[*].code");
        assertThat(codes).hasSize(33).contains("05", "11", "76", "88");

        api.getWith(owner.tenant(), "/api/v1/locations/departments/05/cities")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("05001"));
        api.getWith(owner.tenant(), "/api/v1/locations/cities/11001")
                .andExpect(jsonPath("$.departmentName").value("Bogotá, D.C."));
        api.getWith(owner.tenant(), "/api/v1/locations/cities/00000").andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/locations/departments")).andExpect(status().isUnauthorized());
    }
}
