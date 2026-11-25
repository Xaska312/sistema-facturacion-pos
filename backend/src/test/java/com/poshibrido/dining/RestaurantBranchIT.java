package com.poshibrido.dining;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.id;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Un dueño con una sede que vende como comercio y otra que es restaurante (decisión 377): Mesas abre en la sede que
 * tiene mesas, no en la principal vacía; la principal sigue en la lista para quien la quiera configurar.
 */
class RestaurantBranchIT extends IntegrationTest {

    @Test
    void tablesOpenInTheBranchThatHasThem() throws Exception {
        Owned owner = api.newTenant("dos-sedes");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID principal = api.principalBranchId(s);

        // Sin mesas en ninguna sede: la principal primero, como siempre.
        api.getWith(s, "/api/v1/dining/floor").andExpect(jsonPath("$.branchId").value(principal.toString()));

        UUID restaurant = id(api.postWith(s, "/api/v1/branches", """
                {"code":"IDEAL","name":"Ideal Comer"}
                """).andExpect(status().isCreated()), "$.id");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(restaurant)).andExpect(status().isCreated()), "$.id");
        api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}".formatted(salon))
                .andExpect(status().isCreated());

        // Ahora Mesas abre en la sede con salón, y la principal sigue para elegirla.
        api.getWith(s, "/api/v1/dining/floor")
                .andExpect(jsonPath("$.branchId").value(restaurant.toString()))
                .andExpect(jsonPath("$.branches[0].name").value("Ideal Comer"))
                .andExpect(jsonPath("$.branches[1].id").value(principal.toString()))
                .andExpect(jsonPath("$.zones[0].name").value("Salón"));
        api.getWith(s, "/api/v1/dining/floor?branchId=" + principal)
                .andExpect(jsonPath("$.branchId").value(principal.toString()))
                .andExpect(jsonPath("$.zones.length()").value(0));
    }
}
