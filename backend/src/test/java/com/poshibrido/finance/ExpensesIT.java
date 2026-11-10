package com.poshibrido.finance;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.TRANSFER;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Gastos con categorías (Finanzas parte A, decisión 320): categorías, gasto en efectivo desde la caja y fuera de ella,
 * egresos de antes sin clasificar, totales, corrección, soporte, anulación y exportación.
 */
class ExpensesIT extends IntegrationTest {

    /** Hoy en la zona del negocio (Bogotá): GitHub corre en UTC y de 7 p. m. a medianoche ya es mañana. */
    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("America/Bogota"));
    private static final String RENT = "01920000-0000-7000-8000-000000000a01";
    private static final String UTILITIES = "01920000-0000-7000-8000-000000000a02";
    private static final String OTHER = "01920000-0000-7000-8000-000000000a09";
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

    @Test
    void categoriesAreConfigurable() throws Exception {
        Owned owner = api.newTenant("gastoscat");
        Session s = owner.tenant();
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();

        api.getWith(s, "/api/v1/expense-categories").andExpect(jsonPath("$.length()").value(9))
                .andExpect(jsonPath("$[0].name").value("Arriendo")).andExpect(jsonPath("$[8].name").value("Otros"));
        // El cajero las ve (para su egreso de caja) pero no las cambia.
        api.getWith(cashier, "/api/v1/expense-categories").andExpect(status().isOk());
        api.postWith(cashier, "/api/v1/expense-categories", "{\"name\":\"Aseo\"}").andExpect(status().isForbidden());

        UUID cleaning = id(api.postWith(s, "/api/v1/expense-categories", "{\"name\":\"  Aseo   del local \"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Aseo del local")), "$.id");
        api.postWith(s, "/api/v1/expense-categories", "{\"name\":\"ASEO DEL LOCAL\"}").andExpect(status().isConflict());
        api.postWith(s, "/api/v1/expense-categories", "{\"name\":\" \"}").andExpect(status().is(422));
        api.postWith(s, "/api/v1/expense-categories", "{\"name\":\"sin clasificar\"}").andExpect(status().is(422));
        api.putWith(s, "/api/v1/expense-categories/" + cleaning, "{\"name\":\"arriendo\"}")
                .andExpect(status().isConflict());
        api.putWith(s, "/api/v1/expense-categories/" + cleaning, "{\"name\":\"Aseo\",\"active\":false}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));

        // Apagada: no se ofrece ni sirve para un gasto nuevo, pero sigue en la configuración.
        api.getWith(s, "/api/v1/expense-categories").andExpect(jsonPath("$.length()").value(9));
        api.getWith(s, "/api/v1/expense-categories?includeInactive=true").andExpect(jsonPath("$.length()").value(10));
        api.postWith(s, "/api/v1/expenses", expense("1000", cleaning.toString(), TRANSFER,
                api.principalBranchId(s), null, null)).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("apagada")));
    }

    @Test
    void cashAndBankExpensesWithTotalsCorrectionsAndVoid() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("gastos");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"%d","firstNames":"Arrendador","lastNames":"Local"}"""
                .formatted(10_000_000 + (System.nanoTime() % 80_000_000))).andExpect(status().isCreated()), "$.id");

        // --- En efectivo desde la caja: el cajero, con su caja abierta.
        api.postWith(cashier, "/api/v1/expenses", expense("30000", UTILITIES, CASH, null, null, "Recibo de la luz"))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("Abre tu caja")));
        UUID cashSession = pos.openCash(cashier, CAJA_1, "100000");
        String k = key();
        String cashBody = expense("30000", UTILITIES, CASH, null, null, "Recibo de la luz");
        String created = body(api.postWithHeaders(cashier, "/api/v1/expenses", cashBody, "Idempotency-Key", k)
                .andExpect(status().isCreated()));
        String cashExpense = JsonPath.read(created, "$.id");
        assertThat((Boolean) JsonPath.read(created, "$.fromCash")).isTrue();
        assertThat((Boolean) JsonPath.read(created, "$.cashSessionOpen")).isTrue();
        assertThat((String) JsonPath.read(created, "$.categoryName")).isEqualTo("Servicios públicos");
        assertThat((String) JsonPath.read(created, "$.date")).isEqualTo(TODAY.toString());
        assertThat((String) JsonPath.read(created, "$.branchId")).isEqualTo(branch.toString());
        // La misma clave no saca dos veces la plata.
        api.postWithHeaders(cashier, "/api/v1/expenses", cashBody, "Idempotency-Key", k).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(cashExpense));
        String report = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report"));
        assertThat(number(report, "$.cash.expenses")).isEqualByComparingTo("-30000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("70000");
        api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/movements")
                .andExpect(jsonPath("$[?(@.type == 'EXPENSE')].reason").value("Gasto · Servicios públicos · Recibo de la luz"));
        // No saca más de lo que hay, no lleva otra fecha y el cajero no registra gastos por banco ni ve el listado.
        api.postWith(cashier, "/api/v1/expenses", expense("500000", OTHER, CASH, null, null, null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("suficiente efectivo")));
        api.postWith(cashier, "/api/v1/expenses", expense("1000", OTHER, CASH, null, TODAY.minusDays(1), null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("caja de hoy")));
        api.postWith(cashier, "/api/v1/expenses", expense("1000", OTHER, TRANSFER, branch, null, null))
                .andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/expenses").andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/expenses/summary").andExpect(status().isForbidden());
        api.getWith(cashier, "/api/v1/expenses.csv").andExpect(status().isForbidden());

        // --- Fuera de la caja: el dueño, por transferencia, con fecha de ayer y proveedor. No toca la caja.
        api.postWith(s, "/api/v1/expenses", expense("0", RENT, TRANSFER, branch, null, null)).andExpect(status().is(422));
        api.postWith(s, "/api/v1/expenses", expense("800000", RENT, TRANSFER, null, null, null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("sede")));
        api.postWith(s, "/api/v1/expenses", expense("800000", RENT, TRANSFER, branch, TODAY.plusDays(1), null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("futura")));
        api.postWith(s, "/api/v1/expenses", expense("800000", RENT, credit(owner), branch, null, null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("medio")));
        String rentBody = expense("800000", RENT, TRANSFER, branch, TODAY.minusDays(1), "Arriendo del mes")
                .replace("}", ",\"supplierId\":\"" + supplier + "\",\"reference\":\"NEQ-123\"}");
        String rent = body(api.postWith(s, "/api/v1/expenses", rentBody).andExpect(status().isCreated()));
        String rentId = JsonPath.read(rent, "$.id");
        assertThat((Boolean) JsonPath.read(rent, "$.fromCash")).isFalse();
        assertThat((String) JsonPath.read(rent, "$.supplierName")).isEqualTo("Arrendador Local");
        assertThat((String) JsonPath.read(rent, "$.date")).isEqualTo(TODAY.minusDays(1).toString());
        assertThat(number(body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report")), "$.cash.expected"))
                .isEqualByComparingTo("70000");
        // El dueño no tiene caja abierta: en efectivo debe abrirla.
        api.postWith(s, "/api/v1/expenses", expense("1000", OTHER, CASH, null, null, null))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("Abre tu caja")));

        // --- Egreso de caja como antes (sin categoría): aparece sin clasificar hasta que se clasifica.
        String legacy = body(api.postWith(cashier, "/api/v1/cash/sessions/" + cashSession + "/movements",
                "{\"type\":\"EXPENSE\",\"amount\":5000,\"reason\":\"Bolsas\"}").andExpect(status().isCreated()));
        String movementId = JsonPath.read(legacy, "$.id");
        api.getWith(s, "/api/v1/expenses?unclassified=true").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(movementId))
                .andExpect(jsonPath("$.content[0].categoryName").value("Sin clasificar"))
                .andExpect(jsonPath("$.content[0].note").value("Bolsas"))
                .andExpect(jsonPath("$.content[0].paymentMethodName").value("Efectivo"))
                .andExpect(jsonPath("$.content[0].fromCash").value(true));
        String from = TODAY.minusDays(1).toString();
        String summary = body(api.getWith(s, "/api/v1/expenses/summary?from=" + from));
        assertThat(number(summary, "$.total")).isEqualByComparingTo("835000");
        assertThat(number(summary, "$.cashTotal")).isEqualByComparingTo("35000");
        assertThat(number(summary, "$.otherTotal")).isEqualByComparingTo("800000");
        assertThat(number(summary, "$.unclassifiedTotal")).isEqualByComparingTo("5000");
        assertThat((Integer) JsonPath.read(summary, "$.count")).isEqualTo(3);
        assertThat((String) JsonPath.read(summary, "$.byCategory[0].name")).isEqualTo("Arriendo");
        assertThat((String) JsonPath.read(summary, "$.byCategory[2].name")).isEqualTo("Sin clasificar");
        assertThat((Integer) JsonPath.read(summary, "$.byMethod.length()")).isEqualTo(2);

        api.postWith(cashier, "/api/v1/expenses/unclassified/" + movementId + "/classify",
                "{\"categoryId\":\"" + OTHER + "\"}").andExpect(status().isForbidden());
        String classified = body(api.postWith(s, "/api/v1/expenses/unclassified/" + movementId + "/classify",
                "{\"categoryId\":\"" + OTHER + "\"}").andExpect(status().isCreated()));
        assertThat((String) JsonPath.read(classified, "$.note")).isEqualTo("Bolsas");
        assertThat((String) JsonPath.read(classified, "$.categoryName")).isEqualTo("Otros");
        assertThat(number(classified, "$.amount")).isEqualByComparingTo("5000");
        api.postWith(s, "/api/v1/expenses/unclassified/" + movementId + "/classify",
                "{\"categoryId\":\"" + OTHER + "\"}").andExpect(status().isConflict());
        api.postWith(s, "/api/v1/expenses/unclassified/" + UUID.randomUUID() + "/classify",
                "{\"categoryId\":\"" + OTHER + "\"}").andExpect(status().isNotFound());
        api.getWith(s, "/api/v1/expenses?unclassified=true").andExpect(jsonPath("$.totalElements").value(0));
        // Clasificar no movió otra vez la caja.
        assertThat(number(body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report")), "$.cash.expected"))
                .isEqualByComparingTo("65000");

        // --- Filtros.
        api.getWith(s, "/api/v1/expenses?from=" + from).andExpect(jsonPath("$.totalElements").value(3));
        api.getWith(s, "/api/v1/expenses").andExpect(jsonPath("$.totalElements").value(TODAY.getDayOfMonth() == 1 ? 2 : 3));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&source=CASH").andExpect(jsonPath("$.totalElements").value(2));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&source=OTHER").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&categoryId=" + RENT)
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].id").value(rentId));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&supplierId=" + supplier)
                .andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&paymentMethodId=" + TRANSFER)
                .andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&q=luz").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&q=neq-1").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + TODAY + "&to=" + from).andExpect(status().is(422));

        // --- Corregir: categoría, nota y fecha (la de un gasto en efectivo no cambia).
        api.putWith(s, "/api/v1/expenses/" + rentId, "{\"categoryId\":\"%s\",\"date\":\"%s\",\"note\":\"Arriendo local\"}"
                .formatted(OTHER, TODAY)).andExpect(status().isOk())
                .andExpect(jsonPath("$.categoryName").value("Otros")).andExpect(jsonPath("$.note").value("Arriendo local"))
                .andExpect(jsonPath("$.date").value(TODAY.toString())).andExpect(jsonPath("$.supplierId").doesNotExist());
        api.putWith(s, "/api/v1/expenses/" + cashExpense, "{\"categoryId\":\"%s\",\"date\":\"%s\"}"
                .formatted(UTILITIES, TODAY.minusDays(1))).andExpect(status().is(422));
        api.putWith(cashier, "/api/v1/expenses/" + rentId, "{\"categoryId\":\"%s\"}".formatted(RENT))
                .andExpect(status().isForbidden());

        // --- Soporte: foto o PDF; lo sube quien registró el gasto o quien administra.
        api.uploadNamed(cashier, "/api/v1/expenses/" + cashExpense + "/document", "file", "recibo.png", PNG)
                .andExpect(status().isOk()).andExpect(jsonPath("$.hasDocument").value(true));
        api.uploadNamed(cashier, "/api/v1/expenses/" + rentId + "/document", "file", "recibo.png", PNG)
                .andExpect(status().isForbidden());
        api.uploadNamed(s, "/api/v1/expenses/" + rentId + "/document", "file", "virus.png",
                "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8)).andExpect(status().is(422));
        api.getWith(s, "/api/v1/expenses/" + cashExpense + "/document").andExpect(status().isOk())
                .andExpect(r -> assertThat(r.getResponse().getContentType()).isEqualTo("image/png"))
                .andExpect(r -> assertThat(r.getResponse().getHeader("Content-Disposition")).contains("attachment"))
                .andExpect(r -> assertThat(r.getResponse().getContentAsByteArray()).isEqualTo(PNG));
        api.getWith(s, "/api/v1/expenses/" + rentId + "/document").andExpect(status().isNotFound());
        api.getWith(cashier, "/api/v1/expenses/" + cashExpense + "/document").andExpect(status().isForbidden());

        // --- Exportar: queda en la auditoría.
        String csv = new String(api.getWith(s, "/api/v1/expenses.csv?from=" + from).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertThat(csv).contains("Fecha;Número;Categoría;Valor").contains("Servicios públicos;30000;Efectivo;Caja")
                .contains("Arriendo local");
        assertThat(csv.lines().count()).isEqualTo(4);

        // --- Anular: con motivo; el efectivo vuelve a la caja mientras siga abierta.
        api.postWith(s, "/api/v1/expenses/" + rentId + "/void", "{\"reason\":\" \"}").andExpect(status().is(422));
        api.postWith(cashier, "/api/v1/expenses/" + rentId + "/void", "{\"reason\":\"x\"}").andExpect(status().isForbidden());
        api.postWith(s, "/api/v1/expenses/" + rentId + "/void", "{\"reason\":\"Se registró dos veces\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("VOID"))
                .andExpect(jsonPath("$.voidReason").value("Se registró dos veces"));
        api.postWith(s, "/api/v1/expenses/" + rentId + "/void", "{\"reason\":\"otra vez\"}").andExpect(status().isConflict());
        api.putWith(s, "/api/v1/expenses/" + rentId, "{\"categoryId\":\"%s\"}".formatted(RENT)).andExpect(status().is(422));
        api.postWith(s, "/api/v1/expenses/" + cashExpense + "/void", "{\"reason\":\"El recibo era de otro local\"}")
                .andExpect(status().isOk());
        report = body(api.getWith(s, "/api/v1/cash/sessions/" + cashSession + "/report"));
        assertThat(number(report, "$.cash.expenses")).isEqualByComparingTo("-5000");
        assertThat(number(report, "$.cash.expected")).isEqualByComparingTo("95000");
        summary = body(api.getWith(s, "/api/v1/expenses/summary?from=" + from));
        assertThat(number(summary, "$.total")).isEqualByComparingTo("5000");
        api.getWith(s, "/api/v1/expenses?from=" + from).andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(s, "/api/v1/expenses?from=" + from + "&includeVoided=true")
                .andExpect(jsonPath("$.totalElements").value(3));

        // Con la caja cerrada, el gasto en efectivo ya no se anula.
        String late = JsonPath.read(body(api.postWith(cashier, "/api/v1/expenses",
                expense("10000", OTHER, CASH, null, null, "Domicilio")).andExpect(status().isCreated())), "$.id");
        pos.close(cashier, cashSession, "85000").andExpect(status().isOk());
        api.postWith(s, "/api/v1/expenses/" + late + "/void", "{\"reason\":\"Tarde\"}").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("ya se cerró")));
        api.getWith(s, "/api/v1/expenses/" + late).andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.cashSessionOpen").value(false));

        // Auditoría y protección de la base: un gasto no se borra ni cambia de valor.
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action = 'EXPENSE_CREATED'",
                Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action IN "
                + "('EXPENSE_CLASSIFIED', 'EXPENSE_UPDATED', 'EXPENSE_DOCUMENT_ATTACHED', 'REPORT_EXPORTED')",
                Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".audit_log WHERE action = 'EXPENSE_VOIDED'",
                Integer.class)).isEqualTo(2);
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.update("UPDATE " + schema + ".expenses SET amount = 1 WHERE id = ?", UUID.fromString(late)));
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.update("DELETE FROM " + schema + ".expenses WHERE id = ?", UUID.fromString(late)));
    }

    private UUID credit(Owned owner) {
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        return jdbc.queryForObject("SELECT id FROM " + schema + ".payment_methods WHERE code = 'CREDIT'", UUID.class);
    }

    private static String expense(String amount, String categoryId, UUID method, UUID branch, LocalDate date,
                                  String note) {
        StringBuilder json = new StringBuilder("{\"amount\":" + amount + ",\"categoryId\":\"" + categoryId
                + "\",\"paymentMethodId\":\"" + method + "\"");
        if (branch != null) {
            json.append(",\"branchId\":\"").append(branch).append('"');
        }
        if (date != null) {
            json.append(",\"date\":\"").append(date).append('"');
        }
        if (note != null) {
            json.append(",\"note\":\"").append(note).append('"');
        }
        return json.append('}').toString();
    }
}
