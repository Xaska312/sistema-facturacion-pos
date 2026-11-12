package com.poshibrido.sales;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static com.poshibrido.sales.PosTestSupport.CASH;
import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.key;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Vender sin internet (decisión 332): la copia del catálogo y las ventas que el equipo envía al volver la conexión. */
class OfflineSalesIT extends IntegrationTest {

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void theCatalogCopyHasEveryActiveProductWithItsCodesAndPrice() throws Exception {
        Owned owner = api.newTenant("copia");
        Session s = owner.tenant();
        UUID soda = pos.productWithStock(s, "GAS", "2000", "10", "1000");
        UUID service = pos.service(s, "ENVIO", "5000");

        String json = body(api.getWith(s, "/api/v1/sales/offline-catalog").andExpect(status().isOk()));
        List<String> skus = JsonPath.read(json, "$.items[*].sku");
        assertThat(skus).contains("GAS", "ENVIO");
        assertThat(JsonPath.<List<Object>>read(json, "$.items[?(@.productId == '" + soda + "')].price"))
                .containsExactly(2000.0);
        assertThat(JsonPath.<List<List<String>>>read(json, "$.items[?(@.productId == '" + soda + "')].codes").getFirst())
                .contains("GAS");
        assertThat(JsonPath.<List<Boolean>>read(json, "$.items[?(@.productId == '" + service + "')].trackInventory"))
                .containsExactly(false);
    }

    @Test
    void anOfflineSaleKeepsThePriceChargedItsTimeAndDoesNotStopForStock() throws Exception {
        Owned owner = api.newTenant("sinred");
        Session s = owner.tenant();
        UUID soda = pos.productWithStock(s, "GAS", "2000", "1", "1000");
        pos.openCash(s, CAJA_1, "0");
        Instant soldAt = Instant.now().minus(40, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        String key = key();
        String request = """
                {"items":[{"productId":"%s","quantity":3,"unitPrice":1800}],
                 "payments":[{"paymentMethodId":"%s","amount":6000}],"expectedTotal":5400,
                 "offline":{"number":"C1-0007","soldAt":"%s"}}
                """.formatted(soda, CASH, soldAt);

        // Precio de la copia (1.800, aunque hoy valga 2.000), 3 unidades con 1 en existencia (no se permite negativo)
        String sale = body(pos.sell(s, request, key).andExpect(status().isCreated())
                .andExpect(jsonPath("$.offlineNumber").value("C1-0007"))
                .andExpect(jsonPath("$.total").value(5400))
                .andExpect(jsonPath("$.changeAmount").value(600))
                .andExpect(jsonPath("$.createdAt").value(soldAt.toString())));
        assertThat(pos.stock(s, soda)).isEqualByComparingTo("-2");

        // Reenviarla (se cayó la respuesta) no la duplica
        pos.sell(s, request, key).andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value((String) JsonPath.read(sale, "$.id")));
        assertThat(pos.stock(s, soda)).isEqualByComparingTo("-2");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM t_" + owner.slug() + ".sales", Integer.class)).isEqualTo(1);

        // Una venta normal sí frena por existencias
        pos.sellCash(s, soda, "1", "2000").andExpect(status().is(422));
    }

    @Test
    void anImplausibleTimeKeepsTheArrivalTime() throws Exception {
        Owned owner = api.newTenant("hora");
        Session s = owner.tenant();
        UUID soda = pos.productWithStock(s, "GAS", "2000", "10", "1000");
        pos.openCash(s, CAJA_1, "0");
        String sale = body(pos.sell(s, """
                {"items":[{"productId":"%s","quantity":1,"unitPrice":2000}],
                 "payments":[{"paymentMethodId":"%s","amount":2000}],
                 "offline":{"number":"C1-0001","soldAt":"2020-01-01T00:00:00Z"}}
                """.formatted(soda, CASH), key()).andExpect(status().isCreated()));
        assertThat(Instant.parse(JsonPath.read(sale, "$.createdAt"))).isAfter(Instant.now().minus(1, ChronoUnit.MINUTES));
    }
}
