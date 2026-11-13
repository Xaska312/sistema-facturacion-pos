package com.poshibrido.sales;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.CAJA_1;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Encabezado libre de los documentos (decisión 331): NIT, dirección y celular, un dato por renglón. */
class DocumentHeaderIT extends IntegrationTest {

    private PosTestSupport pos;

    @BeforeEach
    void setUpPos() {
        pos = new PosTestSupport(api);
    }

    @Test
    void theOwnerWritesTheHeaderAndItGoesOnTheReceiptAndDocuments() throws Exception {
        Owned owner = api.newTenant("encabezado");
        Session s = owner.tenant();
        api.getWith(s, "/api/v1/settings").andExpect(jsonPath("$.receiptHeader").value(""));

        // Se guardan los renglones tal cual, sin espacios sobrantes ni renglones vacíos
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":0,
                 "receiptHeader":"  NIT: 900.123.456-7 \\n\\nCalle 10 # 5-20, Centro\\nCel: 300 123 4567  "}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.receiptHeader").value("NIT: 900.123.456-7\nCalle 10 # 5-20, Centro\nCel: 300 123 4567"));

        // Un cliente que no manda el encabezado no lo borra
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":0}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.receiptHeader").value("NIT: 900.123.456-7\nCalle 10 # 5-20, Centro\nCel: 300 123 4567"));

        // Hasta 8 renglones
        api.putWith(s, "/api/v1/settings", """
                {"allowNegativeStock":false,"pricesIncludeTax":true,"timezone":"America/Bogota","currency":"COP",
                 "receiptFooter":"Gracias","maxDiscountPercent":0,"receiptHeader":"1\\n2\\n3\\n4\\n5\\n6\\n7\\n8\\n9"}
                """).andExpect(status().is(422));

        // Documentos del pedido y la cotización
        api.getWith(s, "/api/v1/branding/header").andExpect(status().isOk())
                .andExpect(jsonPath("$.header").value("NIT: 900.123.456-7\nCalle 10 # 5-20, Centro\nCel: 300 123 4567"));

        // Tiquete de venta
        UUID soda = pos.productWithStock(s, "GAS", "2000", "10", "1000");
        pos.openCash(s, CAJA_1, "0");
        pos.sellCash(s, soda, "1", "2000").andExpect(status().isCreated())
                .andExpect(jsonPath("$.receipt.header").value("NIT: 900.123.456-7\nCalle 10 # 5-20, Centro\nCel: 300 123 4567"));
    }
}
