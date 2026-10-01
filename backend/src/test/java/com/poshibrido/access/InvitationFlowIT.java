package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Invite;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InvitationFlowIT extends IntegrationTest {

    @Test
    void invitedUserRegistersAcceptsAndWorksWithTheAssignedRole() throws Exception {
        Owned owner = api.newTenant("inv");
        String email = TestApi.uniqueEmail("cajera");
        Invite invite = api.invite(owner.tenant(), email, api.roleId(owner.tenant(), "CASHIER"),
                api.principalBranchId(owner.tenant()));

        // El token no se guarda en claro
        Integer clear = jdbc.queryForObject("SELECT count(*) FROM platform.invitations WHERE token_hash = ?",
                Integer.class, invite.token());
        assertThat(clear).isZero();

        // Vista previa pública (sin sesión)
        api.postPublic("/api/v1/invitations/preview", tokenJson(invite.token()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.tenantName").isNotEmpty());

        // Otro usuario no puede aceptarla
        Session other = api.registerAndLogin("otro");
        api.acceptRaw(other, invite.token()).andExpect(status().isForbidden());

        // La invitada se registra y la acepta
        api.register(email);
        Session invited = api.login(email);
        api.acceptRaw(invited, invite.token())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId").value(owner.tenantId().toString()));

        String body = api.selectTenantRaw(api.login(email), owner.tenantId())
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> permissions = com.jayway.jsonpath.JsonPath.read(body, "$.permissions");
        assertThat(permissions).contains("sales:create", "cash:operate").doesNotContain("settings:manage");

        // El enlace no sirve dos veces
        api.acceptRaw(api.login(email), invite.token()).andExpect(status().isConflict());

        // Aparece como aceptada y la persona como miembro
        api.getWith(owner.tenant(), "/api/v1/members/invitations?pending=false")
                .andExpect(jsonPath("$.content[0].status").value("ACCEPTED"));
        api.getWith(owner.tenant(), "/api/v1/members")
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void revokedInvitationCannotBeAccepted() throws Exception {
        Owned owner = api.newTenant("invrev");
        String email = TestApi.uniqueEmail("revocada");
        Invite invite = api.invite(owner.tenant(), email, api.roleId(owner.tenant(), "SELLER"),
                api.principalBranchId(owner.tenant()));
        api.postEmpty(owner.tenant(), "/api/v1/members/invitations/" + invite.invitationId() + "/revoke")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"));
        api.register(email);
        api.acceptRaw(api.login(email), invite.token()).andExpect(status().isConflict());
        // Revocar dos veces: conflicto
        api.postEmpty(owner.tenant(), "/api/v1/members/invitations/" + invite.invitationId() + "/revoke")
                .andExpect(status().isConflict());
    }

    @Test
    void expiredInvitationCannotBeAccepted() throws Exception {
        Owned owner = api.newTenant("invexp");
        String email = TestApi.uniqueEmail("vencida");
        Invite invite = api.invite(owner.tenant(), email, api.roleId(owner.tenant(), "SELLER"),
                api.principalBranchId(owner.tenant()));
        jdbc.update("UPDATE platform.invitations SET expires_at = now() - interval '1 minute' WHERE id = ?",
                invite.invitationId());
        api.register(email);
        api.acceptRaw(api.login(email), invite.token()).andExpect(status().is(422));
        api.postPublic("/api/v1/invitations/preview", tokenJson(invite.token()))
                .andExpect(jsonPath("$.expired").value(true));

        // Se puede invitar de nuevo: la vencida se revoca sola
        Invite again = api.invite(owner.tenant(), email, api.roleId(owner.tenant(), "SELLER"),
                api.principalBranchId(owner.tenant()));
        assertThat(jdbc.queryForObject("SELECT status FROM platform.invitations WHERE id = ?", String.class,
                invite.invitationId())).isEqualTo("REVOKED");
        api.acceptRaw(api.login(email), again.token()).andExpect(status().isOk());
    }

    @Test
    void duplicatePendingInvitationAndExistingMemberAreConflicts() throws Exception {
        Owned owner = api.newTenant("invdup");
        UUID role = api.roleId(owner.tenant(), "SELLER");
        UUID branch = api.principalBranchId(owner.tenant());
        String email = TestApi.uniqueEmail("dup");
        api.invite(owner.tenant(), email, role, branch);
        api.inviteRaw(owner.tenant(), email, role, branch).andExpect(status().isConflict());
        // El propio dueño ya es miembro activo
        api.inviteRaw(owner.tenant(), owner.email(), role, branch).andExpect(status().isConflict());
    }

    @Test
    void invalidTokenIsNotFound() throws Exception {
        api.postPublic("/api/v1/invitations/preview", tokenJson("no-existe")).andExpect(status().isNotFound());
        api.postPublic("/api/v1/invitations/preview", "{\"token\":\"\"}").andExpect(status().isBadRequest());
    }

    @Test
    void acceptRequiresSession() throws Exception {
        api.postPublic("/api/v1/invitations/accept", tokenJson("lo-que-sea")).andExpect(status().isUnauthorized());
    }

    @Test
    void deactivatedMemberCanBeInvitedAgainAndIsReactivated() throws Exception {
        Owned owner = api.newTenant("invreact");
        var joined = api.joinAs(owner.tenant(), owner.tenantId(), "SELLER");
        api.postEmpty(owner.tenant(), "/api/v1/members/" + joined.userId() + "/deactivate").andExpect(status().isOk());
        api.selectTenantRaw(api.login(joined.email()), owner.tenantId()).andExpect(status().isForbidden());

        Invite again = api.invite(owner.tenant(), joined.email(), api.roleId(owner.tenant(), "CASHIER"),
                api.principalBranchId(owner.tenant()));
        api.acceptRaw(api.login(joined.email()), again.token()).andExpect(status().isOk());
        api.selectTenantRaw(api.login(joined.email()), owner.tenantId()).andExpect(status().isOk());
    }

    private static String tokenJson(String token) {
        return "{\"token\":\"" + token + "\"}";
    }
}
