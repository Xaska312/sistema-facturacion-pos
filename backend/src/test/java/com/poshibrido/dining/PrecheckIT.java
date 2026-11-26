package com.poshibrido.dining;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Precuenta (decisión 380): dos cervezas de $11.900 (IVA 19 % incluido) y una que se quitó. Sale lo que falta por
 * cobrar, con la base sin IVA y la propina sugerida del 10 % sobre esa base. El mesero la puede imprimir.
 */
class PrecheckIT extends IntegrationTest {

    @Test
    void thePrecheckShowsWhatIsLeftToPayWithTheSuggestedTip() throws Exception {
        Owned owner = api.newTenant("precuenta");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID beer = id(api.postWith(s, "/api/v1/products", """
                {"sku":"POKER","name":"Cerveza Póker","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":11900,
                 "trackInventory":false}""".formatted(UND, IVA19)).andExpect(status().isCreated()), "$.id");
        UUID zone = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Barra\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID table = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"B1\"}".formatted(zone))
                .andExpect(status().isCreated()), "$.id");
        UUID tab = id(api.postWith(s, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\"}".formatted(table))
                .andExpect(status().isCreated()), "$.id");
        String added = api.postWith(s, "/api/v1/tabs/%s/items".formatted(tab), """
                {"items":[{"productId":"%s","quantity":2,"note":"Bien frías"},{"productId":"%s","quantity":1}]}
                """.formatted(beer, beer)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = com.jayway.jsonpath.JsonPath.read(added, "$.items[1].id");
        api.postWith(s, "/api/v1/tabs/%s/items/%s/void".formatted(tab, second), "{\"reason\":\"Se equivocó\"}")
                .andExpect(status().isOk());

        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        api.getWith(waiter, "/api/v1/tabs/%s/precheck".formatted(tab)).andExpect(status().isOk())
                .andExpect(jsonPath("$.label").value("B1"))
                .andExpect(jsonPath("$.lines.length()").value(1))
                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                .andExpect(jsonPath("$.lines[0].details").value("Bien frías"))
                .andExpect(jsonPath("$.total").value(23800.0))
                .andExpect(jsonPath("$.subtotal").value(20000.0))
                .andExpect(jsonPath("$.tax").value(3800.0))
                .andExpect(jsonPath("$.tipPercent").value(10))
                .andExpect(jsonPath("$.suggestedTip").value(2000));
    }
}
