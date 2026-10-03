package com.poshibrido.parties;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Joined;
import com.poshibrido.support.TestApi.Owned;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PartiesIT extends IntegrationTest {

    private static final UUID CONSUMIDOR_FINAL = UUID.fromString("01920000-0000-7000-8000-000000000601");

    @Test
    void finalConsumerIsSeededFirstAndProtected() throws Exception {
        Owned owner = api.newTenant("ter");
        api.getWith(owner.tenant(), "/api/v1/customers")
                .andExpect(jsonPath("$.content[0].id").value(CONSUMIDOR_FINAL.toString()))
                .andExpect(jsonPath("$.content[0].system").value(true))
                .andExpect(jsonPath("$.content[0].displayName").value("Consumidor Final"));
        api.putWith(owner.tenant(), "/api/v1/customers/" + CONSUMIDOR_FINAL, natural("CC", "123456", "Otro", "Nombre"))
                .andExpect(status().is(422));
        api.postEmpty(owner.tenant(), "/api/v1/customers/" + CONSUMIDOR_FINAL + "/deactivate").andExpect(status().is(422));
    }

    @Test
    void naturalAndLegalCustomersWithColombianDocuments() throws Exception {
        Owned owner = api.newTenant("ter2");
        String ana = api.postWith(owner.tenant(), "/api/v1/customers", natural("CC", "1.020.304.050", "Ana María", "Gómez"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.documentNumber").value("1020304050"))
                .andExpect(jsonPath("$.displayName").value("Ana María Gómez"))
                .andExpect(jsonPath("$.priceListName").value("General"))
                .andReturn().getResponse().getContentAsString();
        UUID anaId = UUID.fromString(JsonPath.read(ana, "$.id"));

        // NIT con DV incorrecto, luego correcto
        api.postWith(owner.tenant(), "/api/v1/customers", legal("800197268", 5, "Empresa SAS"))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("debería ser 4")));
        api.postWith(owner.tenant(), "/api/v1/customers", legal("800.197.268", 4, "Empresa SAS"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.formattedDocument").value("800197268-4"));

        // Reglas de persona
        api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"LEGAL","documentType":"CC","documentNumber":"99887766","businessName":"X"}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"99887766","firstNames":"Solo"}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"12AB","firstNames":"A","lastNames":"B"}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"99887766","firstNames":"A","lastNames":"B",
                 "email":"no-es-correo"}
                """).andExpect(status().is(422));
        api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"99887766","firstNames":"A","lastNames":"B",
                 "cityCode":"99999"}
                """).andExpect(status().is(422));

        // Duplicado
        api.postWith(owner.tenant(), "/api/v1/customers", natural("CC", "1020304050", "Otra", "Persona"))
                .andExpect(status().isConflict());

        // Búsqueda por nombre y documento
        api.getWith(owner.tenant(), "/api/v1/customers?search=gómez").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/customers?search=1020304").andExpect(jsonPath("$.totalElements").value(1));
        api.getWith(owner.tenant(), "/api/v1/customers?search=empresa").andExpect(jsonPath("$.totalElements").value(1));

        // Edición
        api.putWith(owner.tenant(), "/api/v1/customers/" + anaId, """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"1020304050","firstNames":"Ana María",
                 "lastNames":"Gómez Ruiz","email":"ANA@CORREO.CO","cityCode":"05001","creditLimit":500000}
                """).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ana@correo.co"))
                .andExpect(jsonPath("$.cityCode").value("05001"));
        api.putWith(owner.tenant(), "/api/v1/customers/" + anaId, legal("800197268", 4, "Robo de documento"))
                .andExpect(status().isConflict());
    }

    @Test
    void samePartyCanBeCustomerAndSupplier() throws Exception {
        Owned owner = api.newTenant("ter3");
        String customer = api.postWith(owner.tenant(), "/api/v1/customers", legal("890903938", 8, "Banco SA"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(JsonPath.read(customer, "$.id"));
        api.postWith(owner.tenant(), "/api/v1/suppliers", legal("890903938", 8, "Banco SA"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.alsoCustomer").value(true));
        api.getWith(owner.tenant(), "/api/v1/customers/" + id).andExpect(jsonPath("$.alsoSupplier").value(true));
        api.postWith(owner.tenant(), "/api/v1/suppliers", legal("890903938", 8, "Banco SA"))
                .andExpect(status().isConflict());
        api.postEmpty(owner.tenant(), "/api/v1/suppliers/" + id + "/deactivate")
                .andExpect(jsonPath("$.active").value(false));
        // El rol de cliente sigue activo
        api.getWith(owner.tenant(), "/api/v1/customers/" + id).andExpect(jsonPath("$.active").value(true));
        // Documento del consumidor final: reservado
        api.postWith(owner.tenant(), "/api/v1/suppliers", natural("CC", "222222222222", "X", "Y"))
                .andExpect(status().is(422));
    }

    @Test
    void customerPriceList() throws Exception {
        Owned owner = api.newTenant("ter4");
        UUID wholesale = UUID.fromString(JsonPath.read(api.postWith(owner.tenant(), "/api/v1/price-lists", """
                {"code":"MAYOR","name":"Mayorista"}
                """).andReturn().getResponse().getContentAsString(), "$.id"));
        String body = api.postWith(owner.tenant(), "/api/v1/customers", """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"55667788","firstNames":"Tienda",
                 "lastNames":"Don Pepe","priceListId":"%s"}
                """.formatted(wholesale)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.priceListName").value("Mayorista"))
                .andReturn().getResponse().getContentAsString();
        UUID id = UUID.fromString(JsonPath.read(body, "$.id"));
        api.postEmpty(owner.tenant(), "/api/v1/price-lists/" + wholesale + "/deactivate").andExpect(status().isOk());
        api.putWith(owner.tenant(), "/api/v1/customers/" + id, """
                {"personType":"NATURAL","documentType":"CC","documentNumber":"55667788","firstNames":"Tienda",
                 "lastNames":"Don Pepe","priceListId":"%s"}
                """.formatted(wholesale)).andExpect(status().is(422));
    }

    @Test
    void permissionsByRole() throws Exception {
        Owned owner = api.newTenant("ter5");
        Joined seller = api.joinAs(owner.tenant(), owner.tenantId(), "SELLER");
        Joined cashier = api.joinAs(owner.tenant(), owner.tenantId(), "CASHIER");
        Joined warehouse = api.joinAs(owner.tenant(), owner.tenantId(), "WAREHOUSE");

        // Vendedor: consulta, no registra
        api.getWith(seller.session(), "/api/v1/customers").andExpect(status().isOk());
        api.postWith(seller.session(), "/api/v1/customers", natural("CC", "11223344", "A", "B"))
                .andExpect(status().isForbidden());
        // Cajero: registra clientes en caja, pero no crea productos
        api.postWith(cashier.session(), "/api/v1/customers", natural("CC", "11223344", "A", "B"))
                .andExpect(status().isCreated());
        api.postWith(cashier.session(), "/api/v1/products",
                com.poshibrido.catalog.CatalogFixturesAccess.simpleProduct("C-1", "No", "1"))
                .andExpect(status().isForbidden());
        api.getWith(cashier.session(), "/api/v1/products").andExpect(status().isOk());
        // Bodeguero: administra productos, no ve clientes
        api.postWith(warehouse.session(), "/api/v1/products",
                com.poshibrido.catalog.CatalogFixturesAccess.simpleProduct("W-1", "Sí", "1"))
                .andExpect(status().isCreated());
        api.getWith(warehouse.session(), "/api/v1/customers").andExpect(status().isForbidden());
    }

    @Test
    void tenantsAreIsolated() throws Exception {
        Owned a = api.newTenant("tera");
        Owned b = api.newTenant("terb");
        UUID customerA = UUID.fromString(JsonPath.read(api.postWith(a.tenant(), "/api/v1/customers",
                natural("CC", "10101010", "Solo", "DeA")).andReturn().getResponse().getContentAsString(), "$.id"));
        UUID productA = UUID.fromString(JsonPath.read(api.postWith(a.tenant(), "/api/v1/products",
                com.poshibrido.catalog.CatalogFixturesAccess.simpleProduct("SOLO-A", "Solo de A", "1", "7704444444444"))
                .andReturn().getResponse().getContentAsString(), "$.id"));

        api.getWith(b.tenant(), "/api/v1/customers/" + customerA).andExpect(status().isNotFound());
        api.getWith(b.tenant(), "/api/v1/customers?search=DeA").andExpect(jsonPath("$.totalElements").value(0));
        api.getWith(b.tenant(), "/api/v1/products/" + productA).andExpect(status().isNotFound());
        api.getWith(b.tenant(), "/api/v1/products/lookup?code=7704444444444").andExpect(status().isNotFound());
        // B puede usar el mismo documento y el mismo código en su propio negocio
        api.postWith(b.tenant(), "/api/v1/customers", natural("CC", "10101010", "Otro", "DeB"))
                .andExpect(status().isCreated());
        api.postWith(b.tenant(), "/api/v1/products",
                com.poshibrido.catalog.CatalogFixturesAccess.simpleProduct("SOLO-A", "De B", "1", "7704444444444"))
                .andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("SELECT name FROM t_" + a.slug() + ".products WHERE id = ?", String.class, productA))
                .isEqualTo("Solo de A");
    }

    private static String natural(String type, String number, String firstNames, String lastNames) {
        return """
                {"personType":"NATURAL","documentType":"%s","documentNumber":"%s","firstNames":"%s","lastNames":"%s"}
                """.formatted(type, number, firstNames, lastNames);
    }

    private static String legal(String nit, int dv, String businessName) {
        return """
                {"personType":"LEGAL","documentType":"NIT","documentNumber":"%s","verificationDigit":%d,"businessName":"%s"}
                """.formatted(nit, dv, businessName);
    }
}
