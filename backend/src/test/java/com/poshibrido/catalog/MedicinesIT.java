package com.poshibrido.catalog;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.sales.PosTestSupport;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Fase 13-1 (decisión 279): catálogo CUM compartido que carga el administrador por tandas, ficha del medicamento con
 * sus reglas (condición de venta, antibióticos, venta por unidad) y búsqueda por principio activo, solo con el módulo
 * Medicamentos.
 */
class MedicinesIT extends IntegrationTest {

    private static final String ROWS = """
            {"rows":[
              {"cum":"%s-1","productName":"DOLEX® 500 MG","holder":"GSK","sanitaryRegistration":"INVIMA 2019M-0001","presentation":"CAJA X 100 TABLETAS","atc":"N02BE01","atcDescription":"PARACETAMOL","route":"ORAL","dosageForm":"TABLETA","activeIngredients":"ACETAMINOFÉN 500 mg"},
              {"cum":"%s-2","productName":"AMOXICILINA 500 MG","holder":"GENFAR","sanitaryRegistration":"INVIMA 2020M-0002","presentation":"CAJA X 50 CAPSULAS","atc":"J01CA04","route":"ORAL","dosageForm":"CAPSULA","activeIngredients":"AMOXICILINA 500 mg"}
            ]}""";

    @Test
    void platformLoadsCatalogAndPharmacySetsMedicineSheets() throws Exception {
        String exp = String.valueOf(System.nanoTime() % 1_000_000_000L);
        Session admin = platformAdmin();
        Owned owner = api.newTenant("droguer");

        // Solo el administrador carga el catálogo, por tandas; si falta una tanda no se cierra.
        api.postWith(owner.platform(), "/api/v1/platform/cum/imports", "{}").andExpect(status().isForbidden());
        String id = JsonPath.read(PosTestSupport.body(api.postWith(admin, "/api/v1/platform/cum/imports",
                "{\"sourceName\":\"CUM.csv\"}").andExpect(status().isCreated())), "$.id");
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/rows".formatted(id), ROWS.formatted(exp, exp))
                .andExpect(status().isOk()).andExpect(jsonPath("$.received").value(2));
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/finish".formatted(id), "{\"total\":3}")
                .andExpect(status().isConflict());
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/finish".formatted(id), "{\"total\":2}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(2));
        api.getWith(admin, "/api/v1/platform/cum").andExpect(jsonPath("$.total").value(2));
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/rows".formatted(id), ROWS.formatted(exp, exp))
                .andExpect(status().isConflict());

        // Un comercio sin el módulo no ve el catálogo; al volverlo Farmacia, sí (búsqueda sin tildes).
        api.getWith(owner.tenant(), "/api/v1/medicines/catalog?q=dolex").andExpect(status().isForbidden());
        api.putWith(admin, "/api/v1/platform/tenants/" + owner.tenantId() + "/business-type",
                "{\"businessType\":\"PHARMACY\"}").andExpect(status().isOk());
        Session s = api.selectTenant(api.login(owner.email()), owner.tenantId());
        api.getWith(s, "/api/v1/business-profile").andExpect(jsonPath("$.modules", org.hamcrest.Matchers.hasItem("MEDICINES")));
        api.getWith(s, "/api/v1/medicines/catalog?q=acetaminofen 500").andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].cum").value(exp + "-1"))
                .andExpect(jsonPath("$[0].sanitaryRegistration").value("INVIMA 2019M-0001"));
        api.getWith(s, "/api/v1/medicines/catalog/" + exp + "-2").andExpect(jsonPath("$.atc").value("J01CA04"));

        UUID amox = PosTestSupport.id(api.postWith(s, "/api/v1/products",
                CatalogFixturesAccess.simpleProduct("AMOX500", "Amoxicilina 500", "15000")).andExpect(status().isCreated()), "$.id");
        String path = "/api/v1/products/" + amox + "/medicine";
        api.getWith(s, path).andExpect(status().isNoContent());

        // Reglas: medicamento sin condición, antibiótico de venta libre, antibiótico por unidad.
        api.putWith(s, path, "{\"kind\":\"MEDICINE\"}").andExpect(status().is(422))
                .andExpect(jsonPath("$.detail", containsString("condición de venta")));
        api.putWith(s, path, """
                {"kind":"MEDICINE","saleCondition":"OTC","atc":"J01CA04","cum":"%s-2"}""".formatted(exp))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("antibiótico")));
        api.putWith(s, path, """
                {"kind":"MEDICINE","saleCondition":"PRESCRIPTION","atc":"J01CA04","unitSale":true}""")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("por unidad")));
        api.putWith(s, path, """
                {"kind":"MEDICINE","saleCondition":"CONTROLLED","unitSale":true}""")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("control especial")));
        api.putWith(s, path, """
                {"kind":"MEDICINE","saleCondition":"PRESCRIPTION","cum":"12-ab"}""")
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("CUM")));

        // Ficha válida: el ATC J01 la marca antibiótico aunque no lo digan.
        api.putWith(s, path, """
                {"kind":"MEDICINE","saleCondition":"PRESCRIPTION","atc":"j01ca04","cum":"%s-2",
                 "sanitaryRegistration":"INVIMA 2020M-0002","activeIngredients":"AMOXICILINA 500 mg",
                 "dosageForm":"CAPSULA","route":"ORAL","holder":"GENFAR"}""".formatted(exp))
                .andExpect(status().isOk()).andExpect(jsonPath("$.antibiotic").value(true))
                .andExpect(jsonPath("$.atc").value("J01CA04"));
        api.getWith(s, "/api/v1/products/" + amox).andExpect(jsonPath("$.medicine.saleCondition").value("PRESCRIPTION"))
                .andExpect(jsonPath("$.medicine.antibiotic").value(true));

        // Un cosmético no lleva condición de venta.
        UUID cream = PosTestSupport.id(api.postWith(s, "/api/v1/products",
                CatalogFixturesAccess.simpleProduct("CREMA", "Crema hidratante", "20000")).andExpect(status().isCreated()), "$.id");
        api.putWith(s, "/api/v1/products/" + cream + "/medicine", """
                {"kind":"COSMETIC","saleCondition":"PRESCRIPTION","antibiotic":false}""")
                .andExpect(status().isOk()).andExpect(jsonPath("$.saleCondition").doesNotExist());

        // Búsqueda de productos por principio activo y marca en la lista.
        api.getWith(s, "/api/v1/products?search=amoxicilina").andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].medicine.antibiotic").value(true));
        api.getWith(s, "/api/v1/audit?action=PRODUCT_MEDICINE_SAVED").andExpect(jsonPath("$.totalElements").value(2));

        // Un cajero ve la ficha pero no la cambia.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.getWith(cashier, path).andExpect(status().isOk());
        api.putWith(cashier, path, "{\"kind\":\"OTHER\"}").andExpect(status().isForbidden());

        // Una carga nueva sin una presentación la quita del catálogo (las fichas de los negocios quedan).
        String second = JsonPath.read(PosTestSupport.body(api.postWith(admin, "/api/v1/platform/cum/imports", "{}")
                .andExpect(status().isCreated())), "$.id");
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/rows".formatted(second), """
                {"rows":[{"cum":"%s-1","productName":"DOLEX 500 MG","activeIngredients":"ACETAMINOFEN 500 mg"}]}"""
                .formatted(exp)).andExpect(status().isOk());
        api.postWith(admin, "/api/v1/platform/cum/imports/%s/finish".formatted(second), "{\"total\":1}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.removed").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        api.getWith(s, "/api/v1/medicines/catalog/" + exp + "-2").andExpect(status().isNotFound());
        api.getWith(s, path).andExpect(jsonPath("$.cum").value(exp + "-2"));
    }
}
