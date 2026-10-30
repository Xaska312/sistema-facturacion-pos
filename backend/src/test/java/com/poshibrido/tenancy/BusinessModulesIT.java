package com.poshibrido.tenancy;

import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tipos de negocio y módulos (Fase 12a, decisión 267): solo el dueño los cambia, un módulo apagado sale del token y
 * del fiado sin borrar datos, y los tipos "Pronto" solo los asigna el administrador de plataforma.
 */
class BusinessModulesIT extends IntegrationTest {

    static final UUID CREDIT = UUID.fromString("01920000-0000-7000-8000-000000000704");

    @Test
    void ownerTurnsModulesOffAndOnWithoutLosingData() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("modulos");
        Session s = owner.tenant();

        // Un negocio nuevo de Comercio trae todos los módulos.
        api.getWith(s, "/api/v1/business-profile").andExpect(status().isOk())
                .andExpect(jsonPath("$.businessType").value("RETAIL"))
                .andExpect(jsonPath("$.modules.length()").value(5))
                .andExpect(jsonPath("$.canEdit").value(true));
        assertThat(payload(s)).contains("module:credit", "credit:manage");

        // Una venta fiada de 10.000 antes de apagar el fiado.
        UUID item = pos.service(s, "SRV", "10000");
        UUID marta = id(api.postWith(s, "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"2001","firstNames":"Marta",
                 "lastNames":"Gómez","phone":"3001234567","creditLimit":50000}
                """).andExpect(status().isCreated()), "$.id");
        pos.openCash(s, CAJA_1, "0");
        sellOnCredit(pos, s, marta, item).andExpect(status().isCreated());

        // Servicios sin fiado: el token renovado ya no trae sus permisos y no se puede fiar.
        api.putWith(s, "/api/v1/business-profile", "{\"businessType\":\"SERVICES\",\"modules\":[\"ORDERS\",\"QUOTES\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.businessType").value("SERVICES"))
                .andExpect(jsonPath("$.modules[0]").value("ORDERS"));
        Session off = renew(s);
        assertThat(payload(off)).doesNotContain("module:credit", "credit:").contains("module:orders", "orders:read");
        api.getWith(off, "/api/v1/credit/accounts/" + marta).andExpect(status().isForbidden());
        sellOnCredit(pos, off, marta, item).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("fiado está apagado")));

        // El dueño sigue pudiendo dar el rol Cajero (que trae permisos de fiado) aunque el fiado esté apagado.
        Joined cashier = api.joinAs(off, owner.tenantId(), "CASHIER");
        api.getWith(cashier.session(), "/api/v1/business-profile").andExpect(jsonPath("$.canEdit").value(false));
        api.putWith(cashier.session(), "/api/v1/business-profile",
                "{\"businessType\":\"RETAIL\",\"modules\":[\"CREDIT\"]}").andExpect(status().isForbidden());

        // Restaurante es "Pronto": el dueño no lo puede elegir.
        api.putWith(off, "/api/v1/business-profile", "{\"businessType\":\"RESTAURANT\",\"modules\":[]}")
                .andExpect(status().is(422));

        // Al prender el fiado otra vez, la cuenta de Marta sigue ahí.
        api.ageRefreshRotations();
        api.putWith(off, "/api/v1/business-profile",
                "{\"businessType\":\"SERVICES\",\"modules\":[\"CREDIT\",\"ORDERS\",\"QUOTES\"]}").andExpect(status().isOk());
        Session on = renew(off);
        String account = body(api.getWith(on, "/api/v1/credit/accounts/" + marta).andExpect(status().isOk()));
        assertThat(number(account, "$.balance")).isEqualByComparingTo("10000");

        // Queda en la auditoría del negocio.
        api.getWith(on, "/api/v1/audit?action=BUSINESS_PROFILE_CHANGED").andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void comingSoonTypesAreOnlyForThePlatformAdmin() throws Exception {
        Session platform = api.registerAndLogin("pronto");
        api.postWith(platform, "/api/v1/tenants", """
                {"slug":"%s","legalName":"Pronto S.A.S.","tradeName":"Pronto","businessType":"PHARMACY"}
                """.formatted(TestApi.uniqueSlug("pronto"))).andExpect(status().is(422));
        api.postWith(platform, "/api/v1/tenants", """
                {"slug":"%s","legalName":"Taller S.A.S.","tradeName":"Taller","businessType":"SERVICES"}
                """.formatted(TestApi.uniqueSlug("taller"))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.businessType").value("SERVICES"));

        Owned owner = api.newTenant("piloto");
        Session admin = platformAdmin();
        String path = "/api/v1/platform/tenants/" + owner.tenantId() + "/business-type";
        api.putWith(owner.platform(), path, "{\"businessType\":\"RESTAURANT\"}").andExpect(status().isForbidden());
        api.putWith(admin, path, "{\"businessType\":\"RESTAURANT\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.businessType").value("RESTAURANT"));
        api.getWith(owner.platform(), "/api/v1/tenants").andExpect(jsonPath("$[0].businessType").value("RESTAURANT"));

        // El piloto conserva su tipo al ajustar sus módulos; tiene los de Restaurante (fiado, pedidos, adiciones, mesas).
        Session pilot = api.selectTenant(api.login(owner.email()), owner.tenantId());
        api.getWith(pilot, "/api/v1/business-profile")
                .andExpect(jsonPath("$.modules.length()").value(4));
        api.putWith(pilot, "/api/v1/business-profile", "{\"businessType\":\"RESTAURANT\",\"modules\":[\"ORDERS\"]}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.businessType").value("RESTAURANT"));
    }

    private ResultActions sellOnCredit(PosTestSupport pos, Session s, UUID customer, UUID item) throws Exception {
        return pos.sell(s, """
                {"customerId":"%s","items":[{"productId":"%s","quantity":1}],
                 "payments":[{"paymentMethodId":"%s","amount":10000}]}
                """.formatted(customer, item, CREDIT), key());
    }

    private Session renew(Session session) throws Exception {
        return TestApi.session(api.refreshRaw(session.refreshToken()).andExpect(status().isOk()).andReturn());
    }

    private static String payload(Session session) {
        return new String(Base64.getUrlDecoder().decode(session.accessToken().split("\\.")[1]),
                StandardCharsets.UTF_8);
    }
}
