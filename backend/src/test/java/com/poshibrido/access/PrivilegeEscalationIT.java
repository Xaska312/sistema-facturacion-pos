package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Nadie puede otorgar ni quitar permisos que no tiene, el rol OWNER no se asigna,
 * el propietario no se modifica y nadie se modifica a sí mismo.
 */
class PrivilegeEscalationIT extends IntegrationTest {

    @Test
    void supervisorCannotGrantRolesWithPermissionsHeDoesNotHave() throws Exception {
        Owned owner = api.newTenant("esc");
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"SUPERVISOR","name":"Supervisor",
                 "permissions":["members:read","members:manage","branches:read"]}
                """).andExpect(status().isCreated());
        Joined supervisor = api.joinAs(owner.tenant(), owner.tenantId(), "SUPERVISOR");
        UUID branch = api.principalBranchId(owner.tenant());

        api.inviteRaw(supervisor.session(), TestApi.uniqueEmail("a"), api.roleId(owner.tenant(), "ADMIN"), branch)
                .andExpect(status().isForbidden());
        api.inviteRaw(supervisor.session(), TestApi.uniqueEmail("b"), api.roleId(owner.tenant(), "CASHIER"), branch)
                .andExpect(status().isForbidden());
        // Un rol cuyos permisos sí tiene: permitido
        api.inviteRaw(supervisor.session(), TestApi.uniqueEmail("c"), api.roleId(owner.tenant(), "SUPERVISOR"), branch)
                .andExpect(status().isCreated());
    }

    @Test
    void supervisorCannotManageMembersWithMorePermissions() throws Exception {
        Owned owner = api.newTenant("esc2");
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"SUPERVISOR","name":"Supervisor",
                 "permissions":["members:read","members:manage","branches:read"]}
                """).andExpect(status().isCreated());
        Joined admin = api.joinAs(owner.tenant(), owner.tenantId(), "ADMIN");
        Joined supervisor = api.joinAs(owner.tenant(), owner.tenantId(), "SUPERVISOR");

        api.postEmpty(supervisor.session(), "/api/v1/members/" + admin.userId() + "/deactivate")
                .andExpect(status().isForbidden());
    }

    @Test
    void ownerRoleCannotBeAssignedNorEdited() throws Exception {
        Owned owner = api.newTenant("esc3");
        UUID ownerRole = api.roleId(owner.tenant(), "OWNER");
        UUID branch = api.principalBranchId(owner.tenant());
        api.inviteRaw(owner.tenant(), TestApi.uniqueEmail("dueno2"), ownerRole, branch).andExpect(status().isForbidden());
        api.putWith(owner.tenant(), "/api/v1/roles/" + ownerRole, """
                {"name":"Jefe","permissions":["sales:read"]}
                """).andExpect(status().is(422));

        Joined seller = api.joinAs(owner.tenant(), owner.tenantId(), "SELLER");
        api.putWith(owner.tenant(), "/api/v1/members/" + seller.userId(), """
                {"roleIds":["%s"],"branchIds":["%s"]}
                """.formatted(ownerRole, branch)).andExpect(status().isForbidden());
    }

    @Test
    void ownerCannotBeModifiedAndNobodyModifiesThemselves() throws Exception {
        Owned owner = api.newTenant("esc4");
        Joined admin = api.joinAs(owner.tenant(), owner.tenantId(), "ADMIN");
        UUID sellerRole = api.roleId(owner.tenant(), "SELLER");
        UUID branch = api.principalBranchId(owner.tenant());

        api.postEmpty(admin.session(), "/api/v1/members/" + owner.ownerId() + "/deactivate")
                .andExpect(status().isForbidden());
        api.putWith(admin.session(), "/api/v1/members/" + owner.ownerId(), """
                {"roleIds":["%s"],"branchIds":["%s"]}
                """.formatted(sellerRole, branch)).andExpect(status().isForbidden());
        api.postEmpty(admin.session(), "/api/v1/members/" + admin.userId() + "/deactivate")
                .andExpect(status().is(422));
    }

    @Test
    void cannotCreateRoleWithPermissionsYouDoNotHave() throws Exception {
        Owned owner = api.newTenant("esc5");
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"ROLEMGR","name":"Gestor de roles","permissions":["roles:manage","sales:read"]}
                """).andExpect(status().isCreated());
        Joined manager = api.joinAs(owner.tenant(), owner.tenantId(), "ROLEMGR");
        api.postWith(manager.session(), "/api/v1/roles", """
                {"code":"VOID","name":"Anulador","permissions":["sales:void"]}
                """).andExpect(status().isForbidden());
        // Tampoco puede quitarle permisos a un rol superior
        api.putWith(manager.session(), "/api/v1/roles/" + api.roleId(owner.tenant(), "ADMIN"), """
                {"name":"Admin","permissions":["sales:read"]}
                """).andExpect(status().isForbidden());
    }
}
