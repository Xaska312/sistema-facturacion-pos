package com.poshibrido.tenancy;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Aislamiento entre negocios en cada módulo de la Fase 2: cajas, roles, miembros, invitaciones y ajustes.
 * Un token del negocio B nunca lee ni modifica recursos del negocio A, ni siquiera conociendo sus IDs.
 */
class ModuleIsolationIT extends IntegrationTest {

    @Test
    void tenantBCannotSeeOrTouchAnythingFromTenantA() throws Exception {
        Owned a = api.newTenant("isoa");
        Owned b = api.newTenant("isob");
        UUID branchA = api.principalBranchId(a.tenant());

        UUID registerA = UUID.fromString(JsonPath.read(api.postWith(a.tenant(), "/api/v1/cash-registers", """
                {"branchId":"%s","code":"SECRETA","name":"Caja de A"}
                """.formatted(branchA)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id"));
        UUID roleA = UUID.fromString(JsonPath.read(api.postWith(a.tenant(), "/api/v1/roles", """
                {"code":"SOLOA","name":"Solo A","permissions":["sales:read"]}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id"));
        UUID invitationA = api.invite(a.tenant(), "persona@a.co", roleA, branchA).invitationId();
        // Las sedes y roles sembrados tienen el mismo ID en todos los negocios: se usa una sede creada solo en A.
        UUID branchOnlyA = UUID.fromString(JsonPath.read(api.postWith(a.tenant(), "/api/v1/branches", """
                {"code":"SOLOA","name":"Sede de A"}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id"));
        api.putWith(a.tenant(), "/api/v1/settings", """
                {"allowNegativeStock":true,"pricesIncludeTax":false,"timezone":"America/Bogota",
                 "currency":"COP","receiptFooter":"Pie de A","maxDiscountPercent":20}
                """).andExpect(status().isOk());

        // Lecturas de B: solo lo suyo
        List<String> registerCodes = JsonPath.read(api.getWith(b.tenant(), "/api/v1/cash-registers?size=100")
                .andReturn().getResponse().getContentAsString(), "$.content[*].code");
        assertThat(registerCodes).doesNotContain("SECRETA");
        List<String> roleCodes = JsonPath.read(api.getWith(b.tenant(), "/api/v1/roles")
                .andReturn().getResponse().getContentAsString(), "$[*].code");
        assertThat(roleCodes).doesNotContain("SOLOA").hasSize(6);
        api.getWith(b.tenant(), "/api/v1/members").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(b.tenant(), "/api/v1/members/invitations").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(b.tenant(), "/api/v1/settings").andExpect(jsonPath("$.receiptFooter").value("Gracias por su compra"));

        // Accesos directos por ID desde B: no existen para B
        api.getWith(b.tenant(), "/api/v1/cash-registers/" + registerA).andExpect(status().isNotFound());
        api.putWith(b.tenant(), "/api/v1/cash-registers/" + registerA, """
                {"name":"Robada"}
                """).andExpect(status().isNotFound());
        api.putWith(b.tenant(), "/api/v1/roles/" + roleA, """
                {"name":"x","permissions":["sales:read"]}
                """).andExpect(status().isNotFound());
        api.deleteWith(b.tenant(), "/api/v1/roles/" + roleA).andExpect(status().isNotFound());
        api.getWith(b.tenant(), "/api/v1/members/" + a.ownerId()).andExpect(status().isNotFound());
        api.postEmpty(b.tenant(), "/api/v1/members/" + a.ownerId() + "/deactivate").andExpect(status().isNotFound());
        api.postEmpty(b.tenant(), "/api/v1/members/invitations/" + invitationA + "/revoke").andExpect(status().isNotFound());
        api.getWith(b.tenant(), "/api/v1/branches/" + branchOnlyA).andExpect(status().isNotFound());
        api.putWith(b.tenant(), "/api/v1/branches/" + branchOnlyA, """
                {"name":"Robada"}
                """).andExpect(status().isNotFound());

        // Nada de A cambió
        assertThat(jdbc.queryForObject("SELECT name FROM t_" + a.slug() + ".cash_registers WHERE id = ?",
                String.class, registerA)).isEqualTo("Caja de A");
        assertThat(jdbc.queryForObject("SELECT status FROM platform.invitations WHERE id = ?",
                String.class, invitationA)).isEqualTo("PENDING");
    }
}
