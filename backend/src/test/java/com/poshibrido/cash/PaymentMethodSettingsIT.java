package com.poshibrido.cash;

import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Addi y Sistecrédito (decisión 366): llegan apagados, el negocio los prende y salen al cobrar con referencia. */
class PaymentMethodSettingsIT extends IntegrationTest {

    static final String ADDI = "01920000-0000-7000-8000-000000000707";
    static final String CASH = "01920000-0000-7000-8000-000000000701";

    @Test
    void addiAndSistecreditoAreOptionalPaymentMethods() throws Exception {
        Session s = api.newTenant("addi").tenant();
        api.getWith(s, "/api/v1/payment-methods/optional").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].code").value("ADDI")).andExpect(jsonPath("$[0].active").value(false))
                .andExpect(jsonPath("$[1].code").value("SISTECREDITO"));
        api.getWith(s, "/api/v1/payment-methods").andExpect(jsonPath("$[*].code", not(hasItem("ADDI"))));

        api.putWith(s, "/api/v1/payment-methods/optional/" + ADDI, "{\"active\":true}").andExpect(status().isOk())
                .andExpect(jsonPath("$[0].active").value(true));
        api.getWith(s, "/api/v1/payment-methods").andExpect(jsonPath("$[*].code", hasItem("ADDI")))
                .andExpect(jsonPath("$[?(@.code == 'ADDI')].requiresReference").value(true))
                .andExpect(jsonPath("$[?(@.code == 'ADDI')].affectsCash").value(false));

        // Los medios que usa la app no se apagan.
        api.putWith(s, "/api/v1/payment-methods/optional/" + CASH, "{\"active\":false}").andExpect(status().is(422));
        api.putWith(s, "/api/v1/payment-methods/optional/" + ADDI, "{\"active\":false}").andExpect(status().isOk());
        api.getWith(s, "/api/v1/payment-methods").andExpect(jsonPath("$[*].code", not(hasItem("ADDI"))));
    }
}
