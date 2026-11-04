package com.poshibrido.cash;

import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Abrir el cajón sin una venta (decisión 286): su propio permiso (lo tienen los roles que operan la caja), exige la
 * caja abierta y cada apertura queda en la auditoría.
 */
class CashDrawerIT extends IntegrationTest {

    @Test
    void openingTheDrawerIsAllowedAndAudited() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("cajon");
        Session s = owner.tenant();
        api.postWith(s, "/api/v1/cash/drawer-openings", "{}").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("Abre la caja")));
        pos.openCash(s, CAJA_1, "0");
        api.postWith(s, "/api/v1/cash/drawer-openings", "{\"reason\":\"Cambio para la otra caja\"}")
                .andExpect(status().isNoContent());

        Session warehouse = api.joinAs(s, owner.tenantId(), "WAREHOUSE").session();
        api.postWith(warehouse, "/api/v1/cash/drawer-openings", "{}").andExpect(status().isForbidden());
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.postWith(cashier, "/api/v1/cash/drawer-openings", "{}").andExpect(status().is(422));

        api.getWith(s, "/api/v1/audit?action=CASH_DRAWER_OPENED").andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].entity").value("cash_session"));
    }
}
