package com.poshibrido.cash;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CashIT extends IntegrationTest {

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void blindCloseCalculatesExpectedAndDifference() throws Exception {
        Owned owner = api.newTenant("arqueo");
        Session s = owner.tenant();
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        Session c = cashier.session();
        UUID product = pos.productWithStock(s, "P1", "4000", "10", "1000");

        api.getWith(c, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());
        List<String> codes = JsonPath.read(body(api.getWith(c, "/api/v1/cash/registers").andExpect(status().isOk())),
                "$[*].code");
        assertThat(codes).containsExactly("CAJA-1");

        UUID session = pos.openCash(c, CAJA_1, "100000");
        api.getWith(c, "/api/v1/cash/sessions/current").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(session.toString()))
                .andExpect(jsonPath("$.registerCode").value("CAJA-1"));
        pos.sellCash(c, product, "1", "10000").andExpect(status().isCreated());
        movement(c, session, "INCOME", "20000", "Base adicional").andExpect(status().isCreated());
        movement(c, session, "EXPENSE", "5000", "Domicilio").andExpect(status().isCreated());
        String withdrawal = body(movement(c, session, "WITHDRAWAL", "50000", "Consignación")
                .andExpect(status().isCreated()));
        assertThat(number(withdrawal, "$.amount")).isEqualByComparingTo("-50000");
        movement(c, session, "SALE", "1000", "x").andExpect(status().is(422));
        movement(c, session, "INCOME", "0", "x").andExpect(status().isBadRequest());

        // El cajero no ve el esperado (cierre ciego)
        String partial = body(api.getWith(c, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isOk()));
        assertThat((Object) JsonPath.read(partial, "$.cash.expected")).isNull();
        assertThat((Boolean) JsonPath.read(partial, "$.auditView")).isFalse();

        // Esperado = 100.000 + 4.000 + 20.000 − 5.000 − 50.000 = 69.000; cuenta 68.000
        String closed = body(pos.close(c, session, "68000").andExpect(status().isOk()));
        assertThat((String) JsonPath.read(closed, "$.session.status")).isEqualTo("CLOSED");
        assertThat((Object) JsonPath.read(closed, "$.cash.difference")).isNull();
        assertThat(number(closed, "$.cash.counted")).isEqualByComparingTo("68000");

        // El dueño (cash:audit) ve esperado y diferencia
        String audited = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isOk()));
        assertThat(number(audited, "$.cash.expected")).isEqualByComparingTo("69000");
        assertThat(number(audited, "$.cash.difference")).isEqualByComparingTo("-1000");
        assertThat(number(audited, "$.cash.incomes")).isEqualByComparingTo("20000");
        assertThat(number(audited, "$.cash.expenses")).isEqualByComparingTo("-5000");
        assertThat(number(audited, "$.cash.withdrawals")).isEqualByComparingTo("-50000");
        assertThat(((Number) JsonPath.read(audited, "$.salesCount")).intValue()).isEqualTo(1);
        assertThat(number(audited, "$.byMethod[0].amount")).isEqualByComparingTo("4000");
        assertThat(number(body(api.getWith(s, "/api/v1/cash/sessions/" + session)), "$.difference"))
                .isEqualByComparingTo("-1000");

        // Una sesión cerrada no se reabre ni recibe movimientos
        pos.close(c, session, "68000").andExpect(status().isConflict());
        movement(c, session, "INCOME", "1000", "x").andExpect(status().is(422));
        api.getWith(c, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());
        pos.sellCash(c, product, "1", "4000").andExpect(status().is(422));

        // Historial
        api.getWith(s, "/api/v1/cash/sessions?status=CLOSED").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].openedByName").isNotEmpty());
        String movements = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/movements"));
        List<String> types = JsonPath.read(movements, "$[*].type");
        assertThat(types).containsExactly("SALE", "INCOME", "EXPENSE", "WITHDRAWAL");
    }

    @Test
    void oneOpenSessionPerRegisterAndPerUser() throws Exception {
        Owned owner = api.newTenant("unica");
        Session s = owner.tenant();
        Session c = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        UUID principal = api.principalBranchId(s);
        UUID caja2 = pos.newRegister(s, principal, "CAJA-2");

        UUID ownerSession = pos.openCash(s, CAJA_1, "0");
        pos.openCashRaw(c, CAJA_1, "0").andExpect(status().isConflict());
        pos.openCashRaw(s, caja2, "0").andExpect(status().isConflict());
        pos.openCashRaw(c, caja2, "-1").andExpect(status().isBadRequest());
        pos.openCashRaw(c, UUID.randomUUID(), "0").andExpect(status().isNotFound());
        UUID cashierSession = pos.openCash(c, caja2, "0");

        // Movimientos solo en la sesión propia; el cierre ajeno solo con cash:audit
        movement(c, ownerSession, "INCOME", "1000", "x").andExpect(status().isForbidden());
        pos.close(c, ownerSession, "0").andExpect(status().isForbidden());
        pos.close(s, cashierSession, "0").andExpect(status().isOk());

        // Cajas de sucursales no asignadas
        UUID north = UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/branches", """
                {"code":"NORTE","name":"Sede Norte"}
                """).andExpect(status().isCreated())), "$.id"));
        UUID northRegister = pos.newRegister(s, north, "CAJA-N");
        pos.openCashRaw(c, northRegister, "0").andExpect(status().isForbidden());
        List<String> codes = JsonPath.read(body(api.getWith(c, "/api/v1/cash/registers")), "$[*].code");
        assertThat(codes).doesNotContain("CAJA-N");

        // Caja inactiva
        api.postEmpty(s, "/api/v1/cash-registers/" + caja2 + "/deactivate").andExpect(status().isOk());
        pos.openCashRaw(c, caja2, "0").andExpect(status().is(422));
    }

    @Test
    void movementIdempotencyKey() throws Exception {
        Owned owner = api.newTenant("movidem");
        Session s = owner.tenant();
        UUID session = pos.openCash(s, CAJA_1, "0");
        String key = key();
        String json = "{\"type\":\"INCOME\",\"amount\":1500,\"reason\":\"Sencillo\"}";
        String first = body(api.postWithHeaders(s, "/api/v1/cash/sessions/" + session + "/movements", json,
                "Idempotency-Key", key).andExpect(status().isCreated()));
        String second = body(api.postWithHeaders(s, "/api/v1/cash/sessions/" + session + "/movements", json,
                "Idempotency-Key", key).andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(second, "$.id")).isEqualTo(JsonPath.read(first, "$.id"));
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.incomes")).isEqualByComparingTo("1500");
    }

    private org.springframework.test.web.servlet.ResultActions movement(Session s, UUID session, String type,
                                                                        String amount, String reason) throws Exception {
        return api.postWith(s, "/api/v1/cash/sessions/" + session + "/movements", """
                {"type":"%s","amount":%s,"reason":"%s"}
                """.formatted(type, amount, reason));
    }
}
