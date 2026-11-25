package com.poshibrido.organization;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.IVA19;
import static com.poshibrido.sales.PosTestSupport.UND;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasItems;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Decisión 378: el dueño de un supermercado abre un restaurante. En un solo paso queda la sucursal con su caja, el
 * salón con sus mesas y la carta, y vendiendo solo platos y jugos: en su Vender no sale el arroz.
 */
class BranchSetupIT extends IntegrationTest {

    @Test
    void aRestaurantBranchIsReadyInOneStepAndSellsOnlyItsCategories() throws Exception {
        Owned owner = api.newTenant("super-y-rest");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES","KITCHEN"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID principal = api.principalBranchId(s);
        UUID groceries = category(s, "Abarrotes", null);
        UUID dishes = category(s, "Platos", null);
        UUID desserts = category(s, "Postres", dishes);
        UUID juices = category(s, "Jugos", null);
        product(s, "ARROZ", "Arroz 1 kg", groceries);
        product(s, "BANDEJA", "Bandeja paisa", dishes);
        product(s, "FLAN", "Flan de caramelo", desserts);
        product(s, "LIMONADA", "Limonada", juices);

        UUID rest = id(api.postWith(s, "/api/v1/branches/setup", """
                {"code":"REST","name":"Restaurante Doña Rosa","registerName":"Caja Restaurante","tables":6,
                 "menuCategoryIds":["%s","%s"],"sellsAll":false,"saleCategoryIds":["%s","%s"]}
                """.formatted(dishes, juices, dishes, juices)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.branch.name").value("Restaurante Doña Rosa"))
                .andExpect(jsonPath("$.tables").value(6))
                .andExpect(jsonPath("$.menuId").isNotEmpty())
                .andExpect(jsonPath("$.notes.length()").value(0)), "$.branch.id");

        // Su caja, su salón con 6 mesas y su carta.
        api.getWith(s, "/api/v1/cash-registers?branchId=" + rest)
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].name").value("Caja Restaurante"));
        api.getWith(s, "/api/v1/dining/floor?branchId=" + rest)
                .andExpect(jsonPath("$.zones[0].name").value("Salón"))
                .andExpect(jsonPath("$.zones[0].tables.length()").value(6));
        api.getWith(s, "/api/v1/dining/menus?branchId=" + rest)
                .andExpect(jsonPath("$[0].name").value("Carta de Restaurante Doña Rosa"))
                .andExpect(jsonPath("$[0].cashRegister.name").value("Caja Restaurante"));

        // Vende platos (con su subcategoría Postres) y jugos; el súper sigue vendiendo todo.
        api.getWith(s, "/api/v1/branches/" + rest + "/sale-categories")
                .andExpect(jsonPath("$.sellsAll").value(false))
                .andExpect(jsonPath("$.categoryIds.length()").value(2))
                .andExpect(jsonPath("$.allowedIds", hasItem(desserts.toString())));
        api.getWith(s, "/api/v1/products?branchId=" + rest)
                .andExpect(jsonPath("$.content[*].sku", containsInAnyOrder("BANDEJA", "FLAN", "LIMONADA")));
        api.getWith(s, "/api/v1/products?branchId=" + principal)
                .andExpect(jsonPath("$.content[*].sku", hasItems("ARROZ", "BANDEJA", "FLAN", "LIMONADA")));
        api.getWith(s, "/api/v1/branches/" + principal + "/sale-categories")
                .andExpect(jsonPath("$.sellsAll").value(true))
                .andExpect(jsonPath("$.allowedIds").value(nullValue()));

        // El lector del restaurante no agrega el arroz.
        api.getWith(s, "/api/v1/products/lookup?code=ARROZ&branchId=" + rest).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("no se vende en Restaurante Doña Rosa")));
        api.getWith(s, "/api/v1/products/lookup?code=FLAN&branchId=" + rest).andExpect(status().isOk());
        api.getWith(s, "/api/v1/products/lookup?code=ARROZ&branchId=" + principal).andExpect(status().isOk());

        // El cajero lo lee (Vender lo necesita) pero no lo cambia.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.getWith(cashier, "/api/v1/branches/" + rest + "/sale-categories").andExpect(status().isOk());
        api.putWith(cashier, "/api/v1/branches/" + principal + "/sale-categories", """
                {"sellsAll":false,"categoryIds":["%s"]}""".formatted(groceries)).andExpect(status().isForbidden());

        // El dueño deja el súper solo con abarrotes; sin categorías no se puede.
        api.putWith(s, "/api/v1/branches/" + principal + "/sale-categories", """
                {"sellsAll":false,"categoryIds":[]}""").andExpect(status().is(422));
        api.putWith(s, "/api/v1/branches/" + principal + "/sale-categories", """
                {"sellsAll":false,"categoryIds":["%s"]}""".formatted(groceries)).andExpect(status().isOk());
        api.getWith(s, "/api/v1/products?branchId=" + principal)
                .andExpect(jsonPath("$.content[*].sku", containsInAnyOrder("ARROZ")));
        api.putWith(s, "/api/v1/branches/" + principal + "/sale-categories", """
                {"sellsAll":true,"categoryIds":[]}""").andExpect(status().isOk());
        api.getWith(s, "/api/v1/products?branchId=" + principal)
                .andExpect(jsonPath("$.content[*].sku", hasItems("ARROZ", "BANDEJA")));
    }

    @Test
    void nothingIsLeftHalfDoneWhenAStepFails() throws Exception {
        Owned owner = api.newTenant("sede-a-medias");
        Session s = owner.tenant();
        // Sin el módulo de Mesas no se crean mesas, y tampoco queda la sucursal.
        api.postWith(s, "/api/v1/branches/setup", """
                {"code":"REST","name":"Restaurante","registerName":"Caja Restaurante","tables":4,"sellsAll":true}
                """).andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("enciende Mesas")));
        api.getWith(s, "/api/v1/branches").andExpect(jsonPath("$.totalElements").value(1));

        // Una tienda más, con su caja y vendiendo lo mismo: sin mesas ni carta.
        UUID store = id(api.postWith(s, "/api/v1/branches/setup", """
                {"code":"NORTE","name":"Sede norte","registerName":"Caja Norte","tables":0,"sellsAll":true}
                """).andExpect(status().isCreated()).andExpect(jsonPath("$.zoneId").value(nullValue())), "$.branch.id");
        api.getWith(s, "/api/v1/cash-registers?branchId=" + store)
                .andExpect(jsonPath("$.content[0].code").value("CAJA-1"));
        api.postWith(s, "/api/v1/branches/setup", """
                {"code":"norte","name":"Otra","tables":0,"sellsAll":true}
                """).andExpect(status().isConflict());
    }

    private UUID category(Session s, String name, UUID parent) throws Exception {
        String body = parent == null ? "{\"name\":\"%s\"}".formatted(name)
                : "{\"name\":\"%s\",\"parentId\":\"%s\"}".formatted(name, parent);
        return id(api.postWith(s, "/api/v1/categories", body).andExpect(status().isCreated()), "$.id");
    }

    private void product(Session s, String sku, String name, UUID category) throws Exception {
        api.postWith(s, "/api/v1/products", """
                {"sku":"%s","name":"%s","categoryId":"%s","baseUnitId":"%s","taxId":"%s","cost":0,"salePrice":10000,
                 "trackInventory":false}""".formatted(sku, name, category, UND, IVA19)).andExpect(status().isCreated());
    }
}
