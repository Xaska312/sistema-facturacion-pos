package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Criterio de aceptación de la Fase 2: un CASHIER no puede llamar endpoints de configuración.
 * Además, cada endpoint de configuración rechaza a quien no tiene su permiso.
 */
class ConfigurationAccessIT extends IntegrationTest {

    @Test
    void cashierIsForbiddenOnEveryConfigurationEndpoint() throws Exception {
        Owned owner = api.newTenant("cfg");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");
        UUID branchId = api.principalBranchId(owner.tenant());
        UUID roleId = api.roleId(owner.tenant(), "SELLER");
        var s = cashier.session();

        // Ajustes
        api.getWith(s, "/api/v1/settings").andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/settings", settingsJson()).andExpect(status().isForbidden());
        // Usuarios e invitaciones
        api.getWith(s, "/api/v1/members").andExpect(status().isForbidden());
        api.getWith(s, "/api/v1/members/invitations").andExpect(status().isForbidden());
        api.inviteRaw(s, "x@test.co", roleId, branchId).andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/members/" + owner.ownerId(), """
                {"roleIds":["%s"],"branchIds":["%s"]}
                """.formatted(roleId, branchId)).andExpect(status().isForbidden());
        api.postEmpty(s, "/api/v1/members/" + owner.ownerId() + "/deactivate").andExpect(status().isForbidden());
        // Roles y permisos
        api.getWith(s, "/api/v1/roles").andExpect(status().isForbidden());
        api.getWith(s, "/api/v1/permissions").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/roles", """
                {"code":"HACK","name":"Hack","permissions":["sales:void"]}
                """).andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/roles/" + roleId, """
                {"name":"x","permissions":["sales:void"]}
                """).andExpect(status().isForbidden());
        api.deleteWith(s, "/api/v1/roles/" + roleId).andExpect(status().isForbidden());
        // Sucursales y cajas (solo lectura permitida)
        api.getWith(s, "/api/v1/branches").andExpect(status().isOk());
        api.getWith(s, "/api/v1/cash-registers").andExpect(status().isOk());
        api.postWith(s, "/api/v1/branches", """
                {"code":"NUEVA","name":"No"}
                """).andExpect(status().isForbidden());
        api.putWith(s, "/api/v1/branches/" + branchId, """
                {"name":"Cambio"}
                """).andExpect(status().isForbidden());
        api.postEmpty(s, "/api/v1/branches/" + branchId + "/deactivate").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/cash-registers", """
                {"branchId":"%s","code":"C9","name":"No"}
                """.formatted(branchId)).andExpect(status().isForbidden());
    }

    @Test
    void accountantCanReadSettingsButNotChangeThem() throws Exception {
        Owned owner = api.newTenant("cfg2");
        Joined accountant = api.joinAs(owner.tenant(), owner.tenantId(), "ACCOUNTANT");
        api.getWith(accountant.session(), "/api/v1/settings").andExpect(status().isOk());
        api.putWith(accountant.session(), "/api/v1/settings", settingsJson()).andExpect(status().isForbidden());
    }

    @Test
    void ownerCanUseEveryConfigurationEndpoint() throws Exception {
        Owned owner = api.newTenant("cfg3");
        api.getWith(owner.tenant(), "/api/v1/settings").andExpect(status().isOk());
        api.putWith(owner.tenant(), "/api/v1/settings", settingsJson()).andExpect(status().isOk());
        api.getWith(owner.tenant(), "/api/v1/members").andExpect(status().isOk());
        api.getWith(owner.tenant(), "/api/v1/roles").andExpect(status().isOk());
        api.getWith(owner.tenant(), "/api/v1/permissions").andExpect(status().isOk());
        api.getWith(owner.tenant(), "/api/v1/members/invitations").andExpect(status().isOk());
    }

    @Test
    void platformTokenIsForbiddenOnConfigurationEndpoints() throws Exception {
        Owned owner = api.newTenant("cfg4");
        api.getWith(owner.platform(), "/api/v1/settings").andExpect(status().isForbidden());
        api.getWith(owner.platform(), "/api/v1/members").andExpect(status().isForbidden());
        api.getWith(owner.platform(), "/api/v1/roles").andExpect(status().isForbidden());
    }

    static String settingsJson() {
        return """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota",
                 "currency":"COP","receiptFooter":"Gracias","maxDiscountPercent":10}
                """;
    }
}
