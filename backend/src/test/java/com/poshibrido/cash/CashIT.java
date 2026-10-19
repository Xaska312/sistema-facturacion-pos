package com.poshibrido.cash;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.mail.MailMessage;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
        // No se puede sacar más efectivo del que hay (QA DIN-4): hay 69.000 y se digitó 1.500.000
        String tooMuch = body(movement(c, session, "WITHDRAWAL", "1500000", "Consignación").andExpect(status().is(422)));
        assertThat((String) JsonPath.read(tooMuch, "$.detail")).contains("1.500.000").doesNotContain("69.000");
        movement(c, session, "EXPENSE", "10000.50", "x").andExpect(status().isBadRequest()); // pesos enteros
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

        // El dueño recibe el resumen del cierre por correo (decisión 253), con lo que el cajero no ve
        MailMessage summary = mailbox.last(owner.email(), "cierre-de-caja").orElseThrow();
        assertThat(summary.subject()).contains("Cierre de caja").contains("Faltan $1.000");
        assertThat(summary.text()).contains("Efectivo esperado: $69.000").contains("Efectivo contado: $68.000")
                .contains("Ventas: 1 por $4.000");
        assertThat(summary.html()).contains("Faltan $1.000");
        assertThat(mailbox.sentTo(cashier.email())).noneMatch(m -> "cierre-de-caja".equals(m.kind()));

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
    void cashCloseSummaryCanBeTurnedOff() throws Exception {
        Owned owner = api.newTenant("sincorreo");
        Session s = owner.tenant();
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":0,"cashCloseEmail":false}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.cashCloseEmail").value(false));
        // Un PUT sin el campo (clientes viejos) conserva el valor
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":0}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.cashCloseEmail").value(false));
        UUID session = pos.openCash(s, CAJA_1, "0");
        pos.close(s, session, "0").andExpect(status().isOk());
        assertThat(mailbox.last(owner.email(), "cierre-de-caja")).isEmpty();
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
        pos.openCashRaw(c, caja2, "10000.50").andExpect(status().isBadRequest()); // pesos enteros (QA DIN-2)
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

    @Test
    void sharedRegisterLetsOthersSellInTheOpenSession() throws Exception {
        Owned owner = api.newTenant("compartida");
        Session s = owner.tenant();
        UUID product = pos.productWithStock(s, "P1", "4000", "10", "1000");
        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        Session v = seller.session();

        // CAJA-1 viene compartida (decisión 256): el dueño la abre en la mañana
        UUID session = pos.openCash(s, CAJA_1, "50000");
        api.getWith(v, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());
        pos.sellCash(v, product, "1", "4000").andExpect(status().is(422));
        api.getWith(v, "/api/v1/cash/registers").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].code").value("CAJA-1"))
                .andExpect(jsonPath("$[0].busy").value(true))
                .andExpect(jsonPath("$[0].shared").value(true))
                .andExpect(jsonPath("$[0].openSessionId").value(session.toString()));

        // El vendedor se une y vende en ella
        api.postEmpty(v, "/api/v1/cash/sessions/" + session + "/join").andExpect(status().isOk())
                .andExpect(jsonPath("$.mine").value(false))
                .andExpect(jsonPath("$.shared").value(true));
        api.getWith(v, "/api/v1/cash/sessions/current").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(session.toString()));
        pos.sellCash(v, product, "1", "4000").andExpect(status().isCreated())
                .andExpect(jsonPath("$.receipt.registerCode").value("CAJA-1"));

        // Registra un egreso, pero no retiros, y no cierra la caja; sí ve el informe (ciego)
        movement(v, session, "EXPENSE", "1000", "Domicilio").andExpect(status().isCreated());
        movement(v, session, "WITHDRAWAL", "1000", "x").andExpect(status().isForbidden());
        pos.close(v, session, "0").andExpect(status().isForbidden());
        api.getWith(v, "/api/v1/cash/sessions/" + session + "/report").andExpect(status().isOk())
                .andExpect(jsonPath("$.salesCount").value(1));
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + session + "/report"));
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("53000");

        // Una caja personal no admite a otros; quien tiene su caja abierta no se une a otra
        String personal = body(api.postWith(s, "/api/v1/cash-registers", """
                {"branchId":"%s","code":"CAJA-2","name":"Caja 2"}
                """.formatted(api.principalBranchId(s))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.shared").value(false)));
        UUID caja2 = UUID.fromString(JsonPath.read(personal, "$.id"));
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        UUID cashierSession = pos.openCash(cashier.session(), caja2, "0");
        api.postEmpty(v, "/api/v1/cash/sessions/" + cashierSession + "/join").andExpect(status().is(422));
        api.postEmpty(cashier.session(), "/api/v1/cash/sessions/" + session + "/join").andExpect(status().isConflict());

        // Dejar la caja: ya no vende en ella
        api.postEmpty(v, "/api/v1/cash/sessions/current/leave").andExpect(status().isNoContent());
        api.getWith(v, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());
        pos.sellCash(v, product, "1", "4000").andExpect(status().is(422));

        // Se puede volver a marcar como compartida o personal
        api.putWith(s, "/api/v1/cash-registers/" + caja2, """
                {"name":"Caja 2","shared":true}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.shared").value(true));
        api.putWith(s, "/api/v1/cash-registers/" + caja2, """
                {"name":"Caja dos"}
                """).andExpect(status().isOk()).andExpect(jsonPath("$.shared").value(true));

        // Al cerrar la caja, quien se unió deja de tenerla
        api.postEmpty(v, "/api/v1/cash/sessions/" + session + "/join").andExpect(status().isOk());
        pos.close(s, session, "53000").andExpect(status().isOk());
        api.getWith(v, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());
        api.postEmpty(v, "/api/v1/cash/sessions/" + session + "/join").andExpect(status().isConflict());
    }

    @Test
    void sharedRegisterSecurityAndConcurrency() throws Exception {
        Owned owner = api.newTenant("compartida-seg");
        Session s = owner.tenant();
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        Joined seller = api.joinAs(s, owner.tenantId(), "SELLER");
        Session v = seller.session();
        Joined admin = api.joinAs(s, owner.tenantId(), "ADMIN");
        UUID s1 = pos.openCash(s, CAJA_1, "150000");
        UUID caja2 = UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/cash-registers", """
                {"branchId":"%s","code":"CAJA-2","name":"Caja 2","shared":true}
                """.formatted(api.principalBranchId(s))).andExpect(status().isCreated())), "$.id"));
        UUID s2 = pos.openCash(admin.session(), caja2, "0");

        // Dos "unirse" a la vez: queda en una sola caja (QA MON-F1)
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> joins = new ArrayList<>();
        for (UUID target : List.of(s1, s2)) {
            joins.add(pool.submit(() -> {
                start.await();
                return api.postEmpty(v, "/api/v1/cash/sessions/" + target + "/join").andReturn().getResponse()
                        .getStatus();
            }));
        }
        start.countDown();
        for (Future<Integer> f : joins) {
            assertThat(f.get(60, TimeUnit.SECONDS)).isEqualTo(200);
        }
        Integer memberships = jdbc.queryForObject("SELECT count(*) FROM " + schema + ".cash_session_users u JOIN "
                + schema + ".cash_sessions x ON x.id = u.cash_session_id WHERE x.status = 'OPEN' AND u.member_id = ?",
                Integer.class, seller.userId());
        assertThat(memberships).isEqualTo(1);

        // Se queda en CAJA-1; dejar la otra queda en la auditoría (QA SEC-F6)
        api.postEmpty(v, "/api/v1/cash/sessions/" + s1 + "/join").andExpect(status().isOk());
        api.postEmpty(v, "/api/v1/cash/sessions/" + s1 + "/join").andExpect(status().isOk());
        String left = body(api.getWith(s, "/api/v1/audit?action=CASH_SESSION_LEFT").andExpect(status().isOk()));
        assertThat(((Number) JsonPath.read(left, "$.totalElements")).intValue()).isGreaterThanOrEqualTo(1);

        // Quien se unió ve solo sus movimientos (QA SEC-F3)
        movement(s, s1, "INCOME", "500", "Sencillo").andExpect(status().isCreated());
        movement(v, s1, "EXPENSE", "1000", "Domicilio").andExpect(status().isCreated());
        List<String> mine = JsonPath.read(body(api.getWith(v, "/api/v1/cash/sessions/" + s1 + "/movements")
                .andExpect(status().isOk())), "$[*].reason");
        assertThat(mine).containsExactly("Domicilio");
        List<String> all = JsonPath.read(body(api.getWith(s, "/api/v1/cash/sessions/" + s1 + "/movements")),
                "$[*].reason");
        assertThat(all).contains("Sencillo", "Domicilio");

        // Dos salidas a la vez no sacan más de lo que hay: 149.500 en caja, 100.000 y 100.000 (QA MON-F2)
        CountDownLatch go = new CountDownLatch(1);
        Future<Integer> withdrawal = pool.submit(() -> {
            go.await();
            return movement(s, s1, "WITHDRAWAL", "100000", "Consignación").andReturn().getResponse().getStatus();
        });
        Future<Integer> expense = pool.submit(() -> {
            go.await();
            return movement(v, s1, "EXPENSE", "100000", "Pago proveedor").andReturn().getResponse().getStatus();
        });
        go.countDown();
        List<Integer> outflows = List.of(withdrawal.get(60, TimeUnit.SECONDS), expense.get(60, TimeUnit.SECONDS));
        pool.shutdown();
        assertThat(outflows).containsExactlyInAnyOrder(201, 422);
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + s1 + "/report"));
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("49500");

        // Si CAJA-1 vuelve a ser personal, quien se unió ya no mueve ni consulta esa caja (QA SEC-F1)
        api.putWith(s, "/api/v1/cash-registers/" + CAJA_1, """
                {"name":"Caja principal","shared":false}
                """).andExpect(status().isOk());
        movement(v, s1, "EXPENSE", "1000", "x").andExpect(status().isForbidden());
        api.getWith(v, "/api/v1/cash/sessions/" + s1 + "/movements").andExpect(status().isForbidden());
        api.getWith(v, "/api/v1/cash/sessions/current").andExpect(status().isNoContent());

        // Una caja de otra sucursal: 403 sin decir nada de ella (QA SEC-F4)
        pos.close(admin.session(), s2, "0").andExpect(status().isOk());
        UUID north = UUID.fromString(JsonPath.read(body(api.postWith(s, "/api/v1/branches", """
                {"code":"NORTE","name":"Sede Norte"}
                """).andExpect(status().isCreated())), "$.id"));
        UUID northRegister = pos.newRegister(s, north, "CAJA-N");
        UUID northSession = pos.openCash(admin.session(), northRegister, "0");
        String denied = body(api.postEmpty(v, "/api/v1/cash/sessions/" + northSession + "/join")
                .andExpect(status().isForbidden()));
        assertThat(denied).doesNotContain("CAJA-N");
    }

    private org.springframework.test.web.servlet.ResultActions movement(Session s, UUID session, String type,
                                                                        String amount, String reason) throws Exception {
        return api.postWith(s, "/api/v1/cash/sessions/" + session + "/movements", """
                {"type":"%s","amount":%s,"reason":"%s"}
                """.formatted(type, amount, reason));
    }
}
