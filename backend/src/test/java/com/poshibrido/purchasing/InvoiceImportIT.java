package com.poshibrido.purchasing;

import com.jayway.jsonpath.JsonPath;
import com.poshibrido.catalog.CatalogFixturesAccess;
import com.poshibrido.parties.domain.Nit;
import com.poshibrido.purchasing.DianSamples.Line;
import com.poshibrido.support.IntegrationTest;
import com.poshibrido.support.TestApi.Owned;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

import static com.poshibrido.sales.PosTestSupport.body;
import static com.poshibrido.sales.PosTestSupport.id;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cargar la factura electrónica del proveedor (decisión 290): se guarda como soporte, se empareja cada línea (código de
 * barras, nombre parecido y lo aprendido de ese proveedor) y nada se registra hasta que una persona confirma.
 */
class InvoiceImportIT extends IntegrationTest {

    private static final LocalDate TODAY = LocalDate.now(java.time.ZoneId.of("America/Bogota"));
    private static final String NIT = "900123456";

    @Test
    void importsElectronicInvoiceMatchesLearnsAndKeepsTheFile() throws Exception {
        Owned owner = api.newTenant("factura-xml");
        Session s = owner.tenant();
        UUID branch = api.principalBranchId(s);
        UUID aceta = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct("ACE500",
                "Acetaminofén 500 mg caja", "5000", "7702001001001")).andExpect(status().isCreated()), "$.id");
        UUID soap = id(api.postWith(s, "/api/v1/products", CatalogFixturesAccess.simpleProduct("JAB3",
                "Jabón antibacterial 3 und", "15000")).andExpect(status().isCreated()), "$.id");
        String xml = DianSamples.invoice(NIT, String.valueOf(Nit.verificationDigit(NIT)), "Distribuidora Andina S.A.S.",
                "FE-991", TODAY.toString(), "2", "55800",
                new Line("A-100", "7702001001001", "ACETAMINOFEN 500 MG X 10", "10", "94", "32000", "0", null),
                new Line("B-200", null, "JABON ANTIBACTERIAL 3 UND", "2", "94", "20000", "19", null),
                new Line("C-300", null, "PRODUCTO QUE NO EXISTE EN XASKA", "1", "94", "100", "0", null));
        byte[] zip = DianSamples.zip(DianSamples.attached(xml));

        // Sin el permiso no se carga; el proveedor sin registrar se avisa con sus datos.
        Session cashier = api.joinAs(s, owner.tenantId(), "CASHIER").session();
        api.upload(cashier, "/api/v1/purchases/documents", zip).andExpect(status().isForbidden());
        api.upload(s, "/api/v1/purchases/documents", "hola".getBytes(StandardCharsets.UTF_8))
                .andExpect(status().is(422)).andExpect(jsonPath("$.detail", containsString("XML o el ZIP")));
        api.upload(s, "/api/v1/purchases/documents", zip).andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("ZIP"))
                .andExpect(jsonPath("$.supplier.id").doesNotExist())
                .andExpect(jsonPath("$.supplier.documentNumber").value(NIT))
                .andExpect(jsonPath("$.supplier.name").value("Distribuidora Andina S.A.S."))
                .andExpect(jsonPath("$.warnings[0]", containsString("no está registrado")));

        UUID supplier = id(api.postWith(s, "/api/v1/suppliers", """
                {"personType":"LEGAL","documentType":"NIT","documentNumber":"%s","verificationDigit":%d,
                 "businessName":"Distribuidora Andina S.A.S."}""".formatted(NIT, Nit.verificationDigit(NIT)))
                .andExpect(status().isCreated()), "$.id");
        String draft = body(api.upload(s, "/api/v1/purchases/documents", zip).andExpect(status().isOk())
                .andExpect(jsonPath("$.supplier.id").value(supplier.toString()))
                .andExpect(jsonPath("$.invoiceNumber").value("FE-991"))
                .andExpect(jsonPath("$.paymentType").value("CREDIT"))
                .andExpect(jsonPath("$.alreadyRegistered").value(false))
                .andExpect(jsonPath("$.lines[0].match.by").value("BARCODE"))
                .andExpect(jsonPath("$.lines[0].match.productId").value(aceta.toString()))
                .andExpect(jsonPath("$.lines[0].unitCost").value(3200))
                .andExpect(jsonPath("$.lines[1].match.by").value("NAME"))
                .andExpect(jsonPath("$.lines[1].match.productId").value(soap.toString()))
                .andExpect(jsonPath("$.lines[1].taxRate").value(19))
                .andExpect(jsonPath("$.lines[2].match").doesNotExist()));
        String documentId = JsonPath.read(draft, "$.documentId");

        // Confirmar: queda como una recepción normal, con el soporte y los códigos del proveedor aprendidos.
        String receipt = body(api.postWith(s, "/api/v1/purchases", """
                {"branchId":"%s","supplierId":"%s","supplierInvoice":"FE-991","invoiceDate":"%s","paymentType":"CREDIT",
                 "dueDate":"%s","checksConfirmed":true,"documentId":"%s","lines":[
                  {"productId":"%s","quantity":10,"unitCost":3200,"taxRate":0,"supplierCode":"A-100"},
                  {"productId":"%s","quantity":2,"unitCost":10000,"taxRate":19,"supplierCode":"b-200"}]}"""
                .formatted(branch, supplier, TODAY, TODAY.plusDays(30), documentId, aceta, soap))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.document.id").value(documentId))
                .andExpect(jsonPath("$.document.kind").value("ZIP")));
        assertThat((Double) JsonPath.read(receipt, "$.summary.total")).isEqualTo(55800.0);
        byte[] stored = api.getWith(s, "/api/v1/purchases/documents/" + documentId + "/file")
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, containsString("attachment")))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(stored).isEqualTo(zip);

        // La misma factura otra vez: ya registrada y las dos líneas por lo aprendido.
        api.upload(s, "/api/v1/purchases/documents", zip).andExpect(status().isOk())
                .andExpect(jsonPath("$.alreadyRegistered").value(true))
                .andExpect(jsonPath("$.lines[0].match.by").value("MEMORY"))
                .andExpect(jsonPath("$.lines[1].match.by").value("MEMORY"))
                .andExpect(jsonPath("$.lines[1].match.lastCost").value(10000));

        // Un soporte sirve para una sola compra.
        api.postWith(s, "/api/v1/purchases", """
                {"branchId":"%s","supplierId":"%s","supplierInvoice":"FE-992","invoiceDate":"%s","paymentType":"CREDIT",
                 "dueDate":"%s","checksConfirmed":true,"documentId":"%s","lines":[
                  {"productId":"%s","quantity":1,"unitCost":3200,"taxRate":0}]}"""
                .formatted(branch, supplier, TODAY, TODAY.plusDays(30), documentId, aceta))
                .andExpect(status().isConflict());
        api.getWith(s, "/api/v1/audit?action=PURCHASE_INVOICE_IMPORTED").andExpect(jsonPath("$.totalElements").value(3));
    }
}
