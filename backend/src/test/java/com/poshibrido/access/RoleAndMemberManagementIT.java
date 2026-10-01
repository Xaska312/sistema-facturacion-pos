package com.poshibrido.access;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RoleAndMemberManagementIT extends IntegrationTest {

    @Test
    void roleLifecycle() throws Exception {
        Owned owner = api.newTenant("roles");
        api.getWith(owner.tenant(), "/api/v1/permissions").andExpect(jsonPath("$.length()").value(22));

        String created = api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"auditor","name":"Auditor","description":"Solo lectura","permissions":["sales:read","reports:read"]}
                """).andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("AUDITOR"))
                .andReturn().getResponse().getContentAsString();
        UUID roleId = UUID.fromString(JsonPath.read(created, "$.id"));

        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"AUDITOR","name":"Otro","permissions":["sales:read"]}
                """).andExpect(status().isConflict());
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"RARO","name":"Raro","permissions":["no:existe"]}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"VACIO","name":"Vacío","permissions":[]}
                """).andExpect(status().isBadRequest());

        api.putWith(owner.tenant(), "/api/v1/roles/" + roleId, """
                {"name":"Auditor interno","permissions":["sales:read"]}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Auditor interno"))
                .andExpect(jsonPath("$.permissions.length()").value(1));

        api.deleteWith(owner.tenant(), "/api/v1/roles/" + api.roleId(owner.tenant(), "CASHIER"))
                .andExpect(status().is(422));
        api.deleteWith(owner.tenant(), "/api/v1/roles/" + roleId).andExpect(status().isNoContent());
        api.deleteWith(owner.tenant(), "/api/v1/roles/" + roleId).andExpect(status().isNotFound());

        Integer audits = jdbc.queryForObject("SELECT count(*) FROM t_" + owner.slug()
                + ".audit_log WHERE entity = 'role'", Integer.class);
        assertThat(audits).isEqualTo(3);
    }

    @Test
    void roleInUseCannotBeDeletedAndPermissionChangesApplyOnRefresh() throws Exception {
        Owned owner = api.newTenant("roles2");
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"LECTOR","name":"Lector","permissions":["branches:read"]}
                """).andExpect(status().isCreated());
        Joined reader = api.joinAs(owner.tenant(), owner.tenantId(), "LECTOR");
        UUID roleId = api.roleId(owner.tenant(), "LECTOR");

        api.deleteWith(owner.tenant(), "/api/v1/roles/" + roleId).andExpect(status().isConflict());
        api.postWith(reader.session(), "/api/v1/branches", """
                {"code":"B2","name":"Dos"}
                """).andExpect(status().isForbidden());

        api.putWith(owner.tenant(), "/api/v1/roles/" + roleId, """
                {"name":"Lector","permissions":["branches:read","branches:manage"]}
                """).andExpect(status().isOk());

        String refreshed = api.refreshRaw(reader.session().refreshToken()).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> permissions = JsonPath.read(refreshed, "$.permissions");
        assertThat(permissions).contains("branches:manage");
    }

    @Test
    void membersCanBeListedUpdatedDeactivatedAndActivated() throws Exception {
        Owned owner = api.newTenant("members");
        Joined seller = api.joinAs(owner.tenant(), owner.tenantId(), "SELLER");
        UUID principal = api.principalBranchId(owner.tenant());
        String second = api.postWith(owner.tenant(), "/api/v1/branches", """
                {"code":"NORTE","name":"Sede norte"}
                """).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID north = UUID.fromString(JsonPath.read(second, "$.id"));

        String membersBody = api.getWith(owner.tenant(), "/api/v1/members")
                .andExpect(jsonPath("$.totalElements").value(2))
                .andReturn().getResponse().getContentAsString();
        List<String> ownerEmails = JsonPath.read(membersBody, "$.content[?(@.owner == true)].email");
        assertThat(ownerEmails).containsExactly(owner.email());

        UUID cashierRole = api.roleId(owner.tenant(), "CASHIER");
        api.putWith(owner.tenant(), "/api/v1/members/" + seller.userId(), """
                {"roleIds":["%s"],"branchIds":["%s","%s"],"defaultBranchId":"%s"}
                """.formatted(cashierRole, principal, north, north))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles[0].code").value("CASHIER"))
                .andExpect(jsonPath("$.branches.length()").value(2))
                .andExpect(jsonPath("$.defaultBranchId").value(north.toString()));

        // Sucursal predeterminada fuera de las asignadas
        api.putWith(owner.tenant(), "/api/v1/members/" + seller.userId(), """
                {"roleIds":["%s"],"branchIds":["%s"],"defaultBranchId":"%s"}
                """.formatted(cashierRole, principal, north)).andExpect(status().is(422));

        // Desactivar: no puede renovar ni volver a entrar
        api.postEmpty(owner.tenant(), "/api/v1/members/" + seller.userId() + "/deactivate")
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        api.refreshRaw(seller.session().refreshToken()).andExpect(status().isUnauthorized());
        api.selectTenantRaw(api.login(seller.email()), owner.tenantId()).andExpect(status().isForbidden());

        // Reactivar
        api.postEmpty(owner.tenant(), "/api/v1/members/" + seller.userId() + "/activate")
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(true));
        api.selectTenantRaw(api.login(seller.email()), owner.tenantId()).andExpect(status().isOk());

        api.getWith(owner.tenant(), "/api/v1/members/" + UUID.randomUUID()).andExpect(status().isNotFound());
    }

    @Test
    void memberSearchFiltersByName() throws Exception {
        Owned owner = api.newTenant("members2");
        api.joinAs(owner.tenant(), owner.tenantId(), "SELLER");
        api.getWith(owner.tenant(), "/api/v1/members?search=prueba")
                .andExpect(jsonPath("$.totalElements").value(2));
        api.getWith(owner.tenant(), "/api/v1/members?search=" + TestApi.uniqueSlug("nadie"))
                .andExpect(jsonPath("$.totalElements").value(0));
    }
}
