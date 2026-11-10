package com.poshibrido.finance;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Gastos fijos (Finanzas parte A2, decisión 321): por pagar, pagar con cambios, saltar, deshacer y apagar. */
class RecurringExpensesIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));
    private static final String RENT = "01920000-0000-7000-8000-000000000a01";
    private static final String OTHER = "01920000-0000-7000-8000-000000000a09";

    @Test
    void dueThenPaySkipUndoAndTurnOff() throws Exception {
        Owned owner = api.newTenant("fijos");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        LocalDate lastMonth = TODAY.minusMonths(1);

        // --- Crear: con validaciones; el cajero no ve ni crea.
        String rentBody = recurring("Arriendo del local", RENT, branch, TRANSFER, "800000", "MONTHLY",
                TODAY.getDayOfMonth(), lastMonth);
        api.postWith(cashier, "/api/v1/recurring-expenses", rentBody).andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/recurring-expenses/due").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/recurring-expenses", rentBody.replace("Arriendo del local", " "))
                .andExpect(status().is(422));
        api.postWith(s, "/api/v1/recurring-expenses", rentBody.replace("\"dayOfMonth\":" + TODAY.getDayOfMonth(),
                "\"dayOfMonth\":0")).andExpect(status().is(422));
        api.postWith(s, "/api/v1/recurring-expenses", rentBody.replace("MONTHLY", "WEEKLY")).andExpect(status().is(422));
        String created = body(api.postWith(s, "/api/v1/recurring-expenses", rentBody).andExpect(status().isCreated()));
        String rent = JsonPath.read(created, "$.id");
        assertThat((String) JsonPath.read(created, "$.nextDue")).isEqualTo(TODAY.toString());
        api.postWith(s, "/api/v1/recurring-expenses", rentBody.replace("Arriendo del local", "ARRIENDO DEL LOCAL"))
                .andExpect(status().isConflict());
        // Uno quincenal que empieza en 8 días: todavía no hay nada por pagar.
        api.postWith(s, "/api/v1/recurring-expenses", recurring("Nómina", OTHER, branch, TRANSFER, "1200000",
                "BIWEEKLY", null, TODAY.plusDays(8))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.dayOfMonth").doesNotExist());

        // --- Por pagar: el del mes pasado (vencido) y el de hoy.
        String due = body(api.getWith(s, "/api/v1/recurring-expenses/due").andExpect(status().isOk()));
        assertThat((Integer) JsonPath.read(due, "$.count")).isEqualTo(2);
        assertThat((Integer) JsonPath.read(due, "$.overdueCount")).isEqualTo(1);
        assertThat(number(due, "$.total")).isEqualByComparingTo("1600000");
        assertThat((String) JsonPath.read(due, "$.items[0].dueDate")).isEqualTo(lastMonth.toString());
        assertThat((Boolean) JsonPath.read(due, "$.items[0].overdue")).isTrue();
        assertThat((Integer) JsonPath.read(due, "$.items[1].daysUntil")).isZero();

        // --- Pagar el vencido: gasto con lo sugerido y la fecha en que tocaba.
        String k = key();
        String pay = "{\"dueDate\":\"" + lastMonth + "\"}";
        String paid = body(api.postWithHeaders(s, "/api/v1/recurring-expenses/" + rent + "/pay", pay, "Idempotency-Key", k)
                .andExpect(status().isCreated()));
        String paidExpense = JsonPath.read(paid, "$.id");
        assertThat(number(paid, "$.amount")).isEqualByComparingTo("800000");
        assertThat((String) JsonPath.read(paid, "$.categoryName")).isEqualTo("Arriendo");
        assertThat((String) JsonPath.read(paid, "$.note")).isEqualTo("Arriendo del local");
        assertThat((String) JsonPath.read(paid, "$.date")).isEqualTo(lastMonth.toString());
        assertThat((Boolean) JsonPath.read(paid, "$.fromCash")).isFalse();
        api.postWithHeaders(s, "/api/v1/recurring-expenses/" + rent + "/pay", pay, "Idempotency-Key", k)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(paidExpense));
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay", pay).andExpect(status().isConflict());
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay",
                "{\"dueDate\":\"" + TODAY.plusDays(1) + "\"}").andExpect(status().is(422));
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay",
                "{\"dueDate\":\"" + TODAY.plusMonths(1) + "\"}").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Todavía no toca")));
        api.getWith(s, "/api/v1/recurring-expenses/due").andExpect(jsonPath("$.count").value(1));

        // --- "Este mes no" para el de hoy; se puede deshacer.
        String today = "{\"dueDate\":\"" + TODAY + "\"}";
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/skip", today).andExpect(status().isNoContent());
        api.getWith(s, "/api/v1/recurring-expenses/due").andExpect(jsonPath("$.count").value(0));
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/skip", today).andExpect(status().isConflict());
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay", today).andExpect(status().isConflict());
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/skip", "{\"dueDate\":\"" + lastMonth + "\"}")
                .andExpect(status().isConflict());
        api.deleteWith(s, "/api/v1/recurring-expenses/" + rent + "/skip/" + TODAY).andExpect(status().isNoContent());
        api.deleteWith(s, "/api/v1/recurring-expenses/" + rent + "/skip/" + TODAY).andExpect(status().isNotFound());

        // --- Pagar el de hoy con otro valor.
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay",
                "{\"dueDate\":\"" + TODAY + "\",\"amount\":850000,\"note\":\"Con el reajuste\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.amount").value(850000))
                .andExpect(jsonPath("$.note").value("Con el reajuste"));
        api.getWith(s, "/api/v1/recurring-expenses/due").andExpect(jsonPath("$.count").value(0));

        // --- Si se anula el gasto, esa fecha vuelve a quedar por pagar.
        api.postWith(s, "/api/v1/expenses/" + paidExpense + "/void", "{\"reason\":\"Se pagó con otra cuenta\"}")
                .andExpect(status().isOk());
        api.getWith(s, "/api/v1/recurring-expenses/due").andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.items[0].dueDate").value(lastMonth.toString()));
        api.postWith(s, "/api/v1/recurring-expenses/" + rent + "/pay", pay).andExpect(status().isCreated());

        // --- En efectivo sale de la caja abierta de quien paga.
        String delivery = JsonPath.read(body(api.postWith(s, "/api/v1/recurring-expenses", recurring("Domicilios",
                OTHER, branch, CASH, "20000", "MONTHLY", TODAY.getDayOfMonth(), TODAY)).andExpect(status().isCreated())),
                "$.id");
        api.postWith(s, "/api/v1/recurring-expenses/" + delivery + "/pay", today).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Abre tu caja")));
        new PosTestSupport(api).openCash(s, CAJA_1, "100000");
        api.postWith(s, "/api/v1/recurring-expenses/" + delivery + "/pay", today).andExpect(status().isCreated())
                .andExpect(jsonPath("$.fromCash").value(true)).andExpect(jsonPath("$.date").value(TODAY.toString()));

        // --- Cambiar y apagar: deja de avisar.
        api.putWith(s, "/api/v1/recurring-expenses/" + rent, rentBody.replace("800000", "850000")
                .replace("}", ",\"active\":false}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.amount").value(850000))
                .andExpect(jsonPath("$.nextDue").doesNotExist());
        api.getWith(s, "/api/v1/recurring-expenses").andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[2].name").value("Arriendo del local"));

        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action = "
                + "'RECURRING_EXPENSE_PAID'", Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action IN "
                + "('RECURRING_EXPENSE_SKIPPED', 'RECURRING_EXPENSE_UNSKIPPED', 'RECURRING_EXPENSE_UPDATED')",
                Integer.class)).isEqualTo(3);
    }

    private static String recurring(String name, String categoryId, UUID branch, UUID method, String amount,
                                    String frequency, Integer day, LocalDate startsOn) {
        return "{\"name\":\"" + name + "\",\"categoryId\":\"" + categoryId + "\",\"branchId\":\"" + branch
                + "\",\"paymentMethodId\":\"" + method + "\",\"amount\":" + amount + ",\"frequency\":\"" + frequency
                + "\"" + (day == null ? "" : ",\"dayOfMonth\":" + day) + ",\"startsOn\":\"" + startsOn + "\"}";
    }
}
