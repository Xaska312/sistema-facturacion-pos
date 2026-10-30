package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static com.poshibrido.sales.PosTestSupport.key;
import static com.poshibrido.sales.PosTestSupport.number;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Adiciones (Fase 12b-1, decisión 268): un local de granizados prende el módulo, crea "Tamaño" (obligatorio) para una
 * categoría y "Extras" para un producto, y vende con tamaño, shots y nota.
 */
class ModifiersIT extends IntegrationTest {

    @Test
    void granizadosSellsWithSizeExtrasAndNote() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("granizados");
        Session off = owner.tenant();

        // Comercio sin el módulo: no se configura ni se vende con adiciones.
        api.postWith(off, "/api/v1/modifier-groups", group("Tamaño", 1, 1, "[]", "[]", "{\"name\":\"Grande\"}"))
                .andExpect(status().isForbidden());
        api.getWith(off, "/api/v1/modifier-groups/pos").andExpect(status().isForbidden());

        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","ORDERS","QUOTES","VARIANTS","SCALE","MODIFIERS"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());

        UUID drinks = id(api.postWith(s, "/api/v1/categories", "{\"name\":\"Granizados\"}")
                .andExpect(status().isCreated()), "$.id");
        UUID granizado = id(api.postWith(s, "/api/v1/products", """
                {"sku":"GRA-1","name":"Granizado de maracuyá","categoryId":"%s","baseUnitId":"%s","taxId":"%s",
                 "cost":0,"salePrice":12000,"trackInventory":false}
                """.formatted(drinks, UND, IVA19)).andExpect(status().isCreated()), "$.id");
        UUID soda = pos.service(s, "GASEOSA", "3000");

        String size = body(api.postWith(s, "/api/v1/modifier-groups", group("Tamaño", 1, 1, "[]",
                "[\"" + drinks + "\"]", "{\"name\":\"Mediano\",\"priceDelta\":0}",
                "{\"name\":\"Grande\",\"priceDelta\":4000}")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.categories[0].name").value("Granizados")));
        UUID large = UUID.fromString(JsonPath.read(size, "$.options[1].id"));
        String extras = body(api.postWith(s, "/api/v1/modifier-groups", group("Extras", 0, 4,
                "[\"" + granizado + "\"]", "[]", "{\"name\":\"Shot extra\",\"priceDelta\":3000,\"maxQuantity\":3}",
                "{\"name\":\"Sin licor\",\"priceDelta\":-2000}")).andExpect(status().isCreated()));
        UUID shot = UUID.fromString(JsonPath.read(extras, "$.options[0].id"));

        // Nombre repetido, mínimo mayor que el máximo y sin opciones.
        api.postWith(s, "/api/v1/modifier-groups", group("tamaño", 0, 1, "[]", "[]", "{\"name\":\"X\"}"))
                .andExpect(status().isConflict());
        api.postWith(s, "/api/v1/modifier-groups", group("Salsas", 3, 2, "[]", "[]", "{\"name\":\"X\"}"))
                .andExpect(status().is(422));

        // El POS ve los grupos y, por producto, los que le aplican (también los de su categoría), obligatorios primero.
        String catalog = body(api.getWith(s, "/api/v1/modifier-groups/pos").andExpect(status().isOk())
                .andExpect(jsonPath("$.groups.length()").value(2))
                .andExpect(jsonPath("$.groups[0].name").value("Tamaño")));
        List<String> granizadoGroups = JsonPath.read(catalog, "$.products['" + granizado + "']");
        assertThat(granizadoGroups).containsExactly(JsonPath.read(size, "$.id"), JsonPath.read(extras, "$.id"));
        assertThat((Object) JsonPath.read(catalog, "$.products")).asString().doesNotContain(soda.toString());

        pos.openCash(s, CAJA_1, "0");

        // Sin el tamaño (obligatorio): no.
        sell(pos, s, granizado, "1", "[{\"optionId\":\"" + shot + "\",\"quantity\":2}]", null)
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("Elige Tamaño")));
        // Una opción que no es de ese producto: no.
        sell(pos, s, soda, "1", "[{\"optionId\":\"" + shot + "\",\"quantity\":1}]", null)
                .andExpect(status().is(422));

        // 2 granizados grandes con 2 shots: (12.000 + 4.000 + 6.000) × 2 = 44.000, con nota.
        String sale = body(sell(pos, s, granizado, "2", "[{\"optionId\":\"" + large + "\"},{\"optionId\":\"" + shot
                + "\",\"quantity\":2}]", "sin azúcar").andExpect(status().isCreated()));
        assertThat(number(sale, "$.total")).isEqualByComparingTo("44000");
        assertThat(number(sale, "$.items[0].unitPrice")).isEqualByComparingTo("22000");
        assertThat((String) JsonPath.read(sale, "$.items[0].note")).isEqualTo("sin azúcar");
        List<String> names = JsonPath.read(sale, "$.items[0].modifiers[*].optionName");
        assertThat(names).containsExactly("Grande", "Shot extra");
        assertThat((Integer) JsonPath.read(sale, "$.items[0].modifiers[1].quantity")).isEqualTo(2);

        // Informe de adiciones: 2 grandes y 4 shots.
        api.getWith(s, "/api/v1/reports/modifiers").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].optionName").value("Shot extra"))
                .andExpect(jsonPath("$[0].units").value(4))
                .andExpect(jsonPath("$[0].amount").value(12000));

        // Un cajero vende con adiciones pero no las configura; queda en la auditoría.
        Joined cashier = api.joinAs(s, owner.tenantId(), "CASHIER");
        api.getWith(cashier.session(), "/api/v1/modifier-groups/pos").andExpect(status().isOk());
        api.postWith(cashier.session(), "/api/v1/modifier-groups", group("Salsas", 0, 2, "[]", "[]",
                "{\"name\":\"Rosada\"}")).andExpect(status().isForbidden());
        api.getWith(s, "/api/v1/audit?action=MODIFIER_GROUP_CREATED").andExpect(jsonPath("$.totalElements").value(2));

        // Al apagar el módulo, la venta ya hecha conserva sus adiciones y no se pueden mandar nuevas.
        api.putWith(s, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["CREDIT","ORDERS","QUOTES","VARIANTS","SCALE"]}
                """).andExpect(status().isOk());
        api.ageRefreshRotations();
        Session again = TestApi.session(api.refreshRaw(s.refreshToken()).andExpect(status().isOk()).andReturn());
        sell(pos, again, granizado, "1", "[{\"optionId\":\"" + large + "\"}]", null).andExpect(status().is(422));
        sell(pos, again, granizado, "1", null, null).andExpect(status().isCreated());
        String saleId = JsonPath.read(sale, "$.id");
        api.getWith(again, "/api/v1/sales/" + saleId)
                .andExpect(jsonPath("$.items[0].modifiers.length()").value(2));
    }

    private static ResultActions sell(PosTestSupport pos, Session s, UUID product, String quantity, String modifiers,
                                      String note) throws Exception {
        return pos.sell(s, """
                {"items":[{"productId":"%s","quantity":%s%s%s}],
                 "payments":[{"paymentMethodId":"%s","amount":100000}]}
                """.formatted(product, quantity, modifiers == null ? "" : ",\"modifiers\":" + modifiers,
                note == null ? "" : ",\"note\":\"" + note + "\"", CASH), key());
    }

    private static String group(String name, int min, int max, String products, String categories,
                                String... options) {
        return """
                {"name":"%s","minSelect":%d,"maxSelect":%d,"productIds":%s,"categoryIds":%s,"options":[%s]}
                """.formatted(name, min, max, products, categories, String.join(",", options));
    }
}
