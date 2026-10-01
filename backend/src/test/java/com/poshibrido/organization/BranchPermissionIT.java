package com.poshibrido.organization;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los permisos del token (calculados desde el schema del negocio) se aplican en cada endpoint.
 * La invitación de miembros llega en Fase 2; aquí se inserta un cajero directamente en BD.
 */
class BranchPermissionIT extends IntegrationTest {

    @Test
    void cashierCanReadButCannotManageBranches() throws Exception {
        Session owner = api.registerAndLogin("perm-owner");
        String slug = TestApi.uniqueSlug("perm");
        UUID tenantId = api.createTenant(owner, slug);

        String cashierEmail = TestApi.uniqueEmail("cajero");
        UUID cashierId = api.register(cashierEmail);
        addMember(slug, tenantId, cashierId, "CASHIER");

        Session cashier = api.selectTenant(api.login(cashierEmail), tenantId);
        api.getWith(cashier, "/api/v1/branches").andExpect(status().isOk());
        api.postWith(cashier, "/api/v1/branches", """
                {"code":"NUEVA","name":"No permitido"}
                """).andExpect(status().isForbidden());
    }

    @Test
    void deactivatedMemberCannotSelectTenant() throws Exception {
        Session owner = api.registerAndLogin("perm-owner2");
        String slug = TestApi.uniqueSlug("perm2");
        UUID tenantId = api.createTenant(owner, slug);

        String email = TestApi.uniqueEmail("inactivo");
        UUID userId = api.register(email);
        addMember(slug, tenantId, userId, "SELLER");
        jdbc.update("UPDATE t_" + slug + ".members SET active = FALSE WHERE id = ?", userId);

        api.selectTenantRaw(api.login(email), tenantId).andExpect(status().isForbidden());
    }

    @Test
    void validationErrorsAreProblemDetails() throws Exception {
        Session owner = api.registerAndLogin("perm-owner3");
        UUID tenantId = api.createTenant(owner, TestApi.uniqueSlug("perm3"));
        Session session = api.selectTenant(owner, tenantId);
        api.postWith(session, "/api/v1/branches", """
                {"code":"","name":""}
                """).andExpect(status().isBadRequest());
        api.getWith(session, "/api/v1/branches?sort=password,asc").andExpect(status().is(422));
    }

    private void addMember(String slug, UUID tenantId, UUID userId, String roleCode) {
        String s = "t_" + slug;
        jdbc.update("""
                INSERT INTO platform.memberships (id, user_id, tenant_id, status, created_at, updated_at, version)
                VALUES (?, ?, ?, 'ACTIVE', now(), now(), 0)
                """, UUID.randomUUID(), userId, tenantId);
        jdbc.update("INSERT INTO " + s + ".members (id, display_name, active, created_at, updated_at, version) "
                + "VALUES (?, 'Miembro', TRUE, now(), now(), 0)", userId);
        jdbc.update("INSERT INTO " + s + ".member_roles (member_id, role_id) SELECT ?, id FROM " + s
                + ".roles WHERE code = ?", userId, roleCode);
    }
}
