package com.poshibrido.access;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Correcciones de seguridad de la Fase 7-6a (ids del registro de hallazgos en docs/QA.md). */
class SecurityHardeningIT extends IntegrationTest {

    @Test
    void parallelWrongPasswordsAllCountTowardTheLockout() throws Exception {
        // SEG-4: con el contador en la entidad, una ráfaga en paralelo contaba como un solo intento.
        String email = TestApi.uniqueEmail("rafaga");
        UUID userId = api.register(email);
        ExecutorService pool = Executors.newFixedThreadPool(5);
        try {
            List<Callable<Integer>> attempts = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                attempts.add(() -> api.loginRaw(email, "ClaveEquivocada1").andReturn().getResponse().getStatus());
            }
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(attempts)) {
                statuses.add(f.get());
            }
            assertThat(statuses).containsOnly(401);
        } finally {
            pool.shutdownNow();
        }
        api.loginRaw(email, TestApi.PASSWORD).andExpect(status().isLocked());
        Integer failed = jdbc.queryForObject("SELECT count(*) FROM platform.security_events"
                + " WHERE event = 'LOGIN_FAILED' AND user_id = ?", Integer.class, userId);
        assertThat(failed).isGreaterThanOrEqualTo(5);
    }

    @Test
    void wrongPasswordsWhenClosingTheBusinessLockTheAccount() throws Exception {
        // SEG-9: "Eliminar negocio" pedía la contraseña sin contar los intentos.
        Owned owner = api.newTenant("cierre-bloq");
        String path = "/api/v1/tenants/" + owner.tenantId() + "/close";
        String wrong = """
                {"confirmation":"Tienda %s","password":"ClaveEquivocada1"}
                """.formatted(owner.slug());
        for (int i = 0; i < 5; i++) {
            api.postWith(owner.tenant(), path, wrong).andExpect(status().is(422));
        }
        api.postWith(owner.tenant(), path, """
                {"confirmation":"Tienda %s","password":"%s"}
                """.formatted(owner.slug(), TestApi.PASSWORD)).andExpect(status().isLocked());
        api.loginRaw(owner.email(), TestApi.PASSWORD).andExpect(status().isLocked());
    }

    @Test
    void reinvitingADeactivatedMemberRequiresBeingAbleToManageThem() throws Exception {
        // SEG-8: invitar de nuevo reactivaba a un miembro que quien invita no puede "Activar".
        Owned owner = api.newTenant("reinv");
        api.postWith(owner.tenant(), "/api/v1/roles", """
                {"code":"SUPERVISOR","name":"Supervisor",
                 "permissions":["members:read","members:manage","branches:read","sales:read"]}
                """).andExpect(status().isCreated());
        Joined admin = api.joinAs(owner.tenant(), owner.tenantId(), "ADMIN");
        Joined supervisor = api.joinAs(owner.tenant(), owner.tenantId(), "SUPERVISOR");
        api.postEmpty(owner.tenant(), "/api/v1/members/" + admin.userId() + "/deactivate").andExpect(status().isOk());

        UUID supervisorRole = api.roleId(owner.tenant(), "SUPERVISOR");
        UUID branch = api.principalBranchId(owner.tenant());
        api.inviteRaw(supervisor.session(), admin.email(), supervisorRole, branch).andExpect(status().isForbidden());
        // Quien sí puede gestionarlo (el dueño) puede volver a invitarlo.
        api.inviteRaw(owner.tenant(), admin.email(), supervisorRole, branch).andExpect(status().isCreated());
    }

    @Test
    void invitationsHaveADailyLimitPerBusiness() throws Exception {
        // SEG-6: sin tope, las invitaciones servían para enviar correos masivos.
        Owned owner = api.newTenant("tope");
        UUID role = api.roleId(owner.tenant(), "CASHIER");
        UUID branch = api.principalBranchId(owner.tenant());
        jdbc.update("""
                INSERT INTO platform.invitations (id, tenant_id, email, token_hash, status, expires_at, invited_by,
                                                  created_at, updated_at, version)
                SELECT gen_random_uuid(), ?, 'previa' || n || '@test.co', md5(random()::text) || md5(random()::text),
                       'REVOKED', now() + interval '7 days', ?, now() - interval '1 hour', now(), 0
                FROM generate_series(1, 50) AS n""", owner.tenantId(), owner.ownerId());

        String email = TestApi.uniqueEmail("tope");
        api.inviteRaw(owner.tenant(), email, role, branch).andExpect(status().isTooManyRequests());
        assertThat(mailbox.sentTo(email)).isEmpty();
    }
}
