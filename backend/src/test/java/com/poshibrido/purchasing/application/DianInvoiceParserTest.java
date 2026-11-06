package com.poshibrido.purchasing.application;

import com.poshibrido.purchasing.DianSamples;
import com.poshibrido.purchasing.DianSamples.Line;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedInvoice;
import com.poshibrido.shared.error.BusinessRuleException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DianInvoiceParserTest {

    private static final String XML = DianSamples.invoice("900123456", "7", "Distribuidora Andina S.A.S.", "fe-991",
            "2026-11-03", "2", "61880",
            new Line("A-100", "7702001001001", "ACETAMINOFEN 500 MG X 10 TAB Lote: AB12 Vence: 08/2028", "10", "94",
                    "32000", "0", null),
            new Line("B-200", null, "JABON  ANTIBACTERIAL 3 UND", "2", "BX", "20000", "19", "LOTE 9X-1 VENC 2029-01-31"));

    @Test
    void readsAttachedDocumentInsideZip() throws Exception {
        ParsedInvoice inv = DianInvoiceParser.parse(DianSamples.zip(DianSamples.attached(XML)));
        assertThat(inv.supplier().nit()).isEqualTo("900123456");
        assertThat(inv.supplier().verificationDigit()).isEqualTo(7);
        assertThat(inv.supplier().name()).isEqualTo("Distribuidora Andina S.A.S.");
        assertThat(inv.number()).isEqualTo("FE-991");
        assertThat(inv.issueDate()).isEqualTo(LocalDate.of(2026, 11, 3));
        assertThat(inv.paymentType()).isEqualTo("CREDIT");
        assertThat(inv.cufe()).isEqualTo("abc123cufe");
        assertThat(inv.payable()).isEqualByComparingTo("61880");
        assertThat(inv.lines()).hasSize(2);

        var first = inv.lines().getFirst();
        assertThat(first.sellerCode()).isEqualTo("A-100");
        assertThat(first.standardCode()).isEqualTo("7702001001001");
        assertThat(first.unitCost()).isEqualByComparingTo("3200");
        assertThat(first.quantity()).isEqualByComparingTo("10");
        assertThat(first.packageUnit()).isFalse();
        assertThat(first.lotNumber()).isEqualTo("AB12");
        assertThat(first.expirationDate()).isEqualTo(LocalDate.of(2028, 8, 31));

        var second = inv.lines().get(1);
        assertThat(second.description()).isEqualTo("JABON ANTIBACTERIAL 3 UND");
        assertThat(second.unitCost()).isEqualByComparingTo("10000");
        assertThat(second.taxRate()).isEqualByComparingTo("19");
        assertThat(second.packageUnit()).isTrue();
        assertThat(second.lotNumber()).isEqualTo("9X-1");
        assertThat(second.expirationDate()).isEqualTo(LocalDate.of(2029, 1, 31));
    }

    @Test
    void readsPlainInvoiceXml() {
        ParsedInvoice inv = DianInvoiceParser.parse(XML.getBytes(StandardCharsets.UTF_8));
        assertThat(inv.lines()).hasSize(2);
    }

    @Test
    void rejectsExternalEntitiesAndOtherDocuments() {
        String xxe = """
                <?xml version="1.0"?>
                <!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>
                <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">&e;</Invoice>""";
        assertThatThrownBy(() -> DianInvoiceParser.parse(xxe.getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(BusinessRuleException.class);
        String note = XML.replace("<Invoice ", "<CreditNote ").replace("</Invoice>", "</CreditNote>");
        assertThatThrownBy(() -> DianInvoiceParser.parse(note.getBytes(StandardCharsets.UTF_8)))
                .hasMessageContaining("nota crédito");
        assertThatThrownBy(() -> DianInvoiceParser.parse("%PDF-1.4".getBytes(StandardCharsets.UTF_8)))
                .hasMessageContaining("XML");
    }

    @Test
    void normalizesWordsForNameMatching() {
        assertThat(InvoiceDocumentService.words("Acetaminofén 500 mg x 10 tabletas"))
                .containsExactly("ACETAMINOFEN", "500MG", "10", "TABLETAS");
    }
}
