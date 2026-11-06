package com.poshibrido.dining;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;

import java.nio.charset.StandardCharsets;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El Mesero solo atiende mesas (decisión 293): abre la cuenta, pide con el precio vigente y envía a cocina, pero no
 * cobra, no abre caja ni ve ventas, clientes o existencias. La migración V37 solo cambia el rol si nadie lo había
 * editado.
 */
class WaiterFloorIT extends IntegrationTest {

    private static final List<String> OLD_DEFAULT = List.of("branches:read", "cash:drawer", "cash:operate",
            "inventory:read", "kitchen:send", "parties:read", "products:read", "sales:create", "sales:read",
            "tables:operate");

    @Test
    void theWaiterOrdersButDoesNotCharge() throws Exception {
        PosTestSupport pos = new PosTestSupport(api);
        Owned owner = api.newTenant("mesero-solo");
        Session off = owner.tenant();
        api.putWith(off, "/api/v1/business-profile", """
                {"businessType":"RETAIL","modules":["TABLES","KITCHEN"]}
                """).andExpect(status().isOk());
        Session s = TestApi.session(api.refreshRaw(off.refreshToken()).andExpect(status().isOk()).andReturn());
        UUID branch = api.principalBranchId(s);
        UUID burger = pos.service(s, "HAMB", "18000");
        UUID salon = id(api.postWith(s, "/api/v1/dining/zones", "{\"branchId\":\"%s\",\"name\":\"Salón\"}"
                .formatted(branch)).andExpect(status().isCreated()), "$.id");
        UUID mesa = id(api.postWith(s, "/api/v1/dining/tables", "{\"zoneId\":\"%s\",\"name\":\"1\"}".formatted(salon))
                .andExpect(status().isCreated()), "$.id");

        List<String> perms = JsonPath.read(body(api.getWith(s, "/api/v1/roles")), "$[?(@.code=='WAITER')].permissions[*]");
        assertThat(perms).containsExactlyInAnyOrder("branches:read", "kitchen:send", "products:read", "tables:operate");

        Session waiter = api.joinAs(s, owner.tenantId(), "WAITER").session();
        api.getWith(waiter, "/api/v1/sales/price?productId=" + burger).andExpect(status().isOk());
        UUID tab = id(api.postWith(waiter, "/api/v1/tabs", "{\"kind\":\"TABLE\",\"tableId\":\"%s\",\"guests\":3}"
                .formatted(mesa)).andExpect(status().isCreated()), "$.id");
        api.postWith(waiter, "/api/v1/tabs/%s/items".formatted(tab), """
                {"send":true,"items":[{"productId":"%s","quantity":2}]}""".formatted(burger))
                .andExpect(status().is2xxSuccessful());
        api.getWith(waiter, "/api/v1/sales").andExpect(status().isForbidden());
        api.getWith(waiter, "/api/v1/tips").andExpect(status().isForbidden());
    }

    @Test
    void theMigrationRespectsAWaiterRoleTheOwnerEdited() throws Exception {
        Owned owner = api.newTenant("mesero-editado");
        String schema = jdbc.queryForObject("SELECT schema_name FROM platform.tenants WHERE id = ?", String.class,
                owner.tenantId());
        String sql = new ClassPathResource("db/tenant/V37__waiter_floor_only.sql")
                .getContentAsString(StandardCharsets.UTF_8);

        // Como estaba antes de esta versión, más un permiso que le dio el dueño: no se toca.
        setWaiter(schema, OLD_DEFAULT, "reports:read");
        run(schema, sql);
        assertThat(waiterPerms(schema)).hasSize(OLD_DEFAULT.size() + 1).contains("cash:operate", "reports:read");

        // Como lo dejó XASKA: queda solo para atender mesas.
        setWaiter(schema, OLD_DEFAULT, null);
        run(schema, sql);
        assertThat(waiterPerms(schema))
                .containsExactlyInAnyOrder("branches:read", "kitchen:send", "products:read", "tables:operate");
    }

    private void setWaiter(String schema, List<String> perms, String extra) {
        jdbc.update("DELETE FROM %s.role_permissions WHERE role_id = (SELECT id FROM %s.roles WHERE code = 'WAITER')"
                .formatted(schema, schema));
        for (String p : extra == null ? perms : concat(perms, extra)) {
            jdbc.update(("INSERT INTO %s.role_permissions (role_id, permission_code) "
                    + "SELECT id, ? FROM %s.roles WHERE code = 'WAITER'").formatted(schema, schema), p);
        }
    }

    private static List<String> concat(List<String> list, String extra) {
        return java.util.stream.Stream.concat(list.stream(), java.util.stream.Stream.of(extra)).toList();
    }

    private List<String> waiterPerms(String schema) {
        return jdbc.queryForList(("SELECT permission_code FROM %s.role_permissions WHERE role_id = "
                + "(SELECT id FROM %s.roles WHERE code = 'WAITER')").formatted(schema, schema), String.class);
    }

    private void run(String schema, String sql) {
        jdbc.execute((ConnectionCallback<Void>) c -> {
            try (Statement st = c.createStatement()) {
                st.execute("SET search_path TO " + schema);
                st.execute(sql);
                st.execute("SET search_path TO platform");
            }
            return null;
        });
    }
}
