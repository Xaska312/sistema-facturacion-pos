package com.poshibrido.purchasing;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Facturas electrónicas de prueba (UBL 2.1 como las emite la DIAN), recortadas a lo que XASKA lee. */
public final class DianSamples {

    private DianSamples() {
    }

    /** Una línea: código del vendedor, GTIN (o null), descripción, cantidad, unidad, valor sin IVA, IVA %, nota. */
    public record Line(String sellerCode, String gtin, String description, String quantity, String unitCode,
                       String net, String vat, String note) {
    }

    public static String invoice(String nit, String dv, String name, String number, String issueDate, String paymentId,
                                 String payable, Line... lines) {
        StringBuilder xml = new StringBuilder("""
                <?xml version="1.0" encoding="UTF-8"?>
                <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
                    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
                  <cbc:ID>%s</cbc:ID>
                  <cbc:UUID schemeName="CUFE-SHA384">abc123cufe</cbc:UUID>
                  <cbc:IssueDate>%s</cbc:IssueDate>
                  <cbc:DueDate>%s</cbc:DueDate>
                  <cac:AccountingSupplierParty><cbc:AdditionalAccountID>1</cbc:AdditionalAccountID><cac:Party>
                    <cac:PartyName><cbc:Name>%s</cbc:Name></cac:PartyName>
                    <cac:PartyTaxScheme><cbc:RegistrationName>%s</cbc:RegistrationName>
                      <cbc:CompanyID schemeAgencyID="195" schemeID="%s" schemeName="31">%s</cbc:CompanyID>
                      <cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>
                  </cac:Party></cac:AccountingSupplierParty>
                  <cac:PaymentMeans><cbc:ID>%s</cbc:ID><cbc:PaymentMeansCode>10</cbc:PaymentMeansCode></cac:PaymentMeans>
                  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="COP">%s</cbc:PayableAmount></cac:LegalMonetaryTotal>
                """.formatted(number, issueDate, issueDate, name, name, dv, nit, paymentId, payable));
        int i = 0;
        for (Line l : lines) {
            i++;
            xml.append("""
                      <cac:InvoiceLine><cbc:ID>%d</cbc:ID>
                        %s
                        <cbc:InvoicedQuantity unitCode="%s">%s</cbc:InvoicedQuantity>
                        <cbc:LineExtensionAmount currencyID="COP">%s</cbc:LineExtensionAmount>
                        <cac:TaxTotal><cac:TaxSubtotal><cbc:TaxAmount currencyID="COP">0</cbc:TaxAmount>
                          <cac:TaxCategory><cbc:Percent>%s</cbc:Percent><cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme></cac:TaxCategory>
                        </cac:TaxSubtotal></cac:TaxTotal>
                        <cac:Item><cbc:Description>%s</cbc:Description>
                          <cac:SellersItemIdentification><cbc:ID>%s</cbc:ID></cac:SellersItemIdentification>
                          %s
                        </cac:Item>
                        <cac:Price><cbc:PriceAmount currencyID="COP">0</cbc:PriceAmount></cac:Price>
                      </cac:InvoiceLine>
                    """.formatted(i, l.note() == null ? "" : "<cbc:Note>" + l.note() + "</cbc:Note>", l.unitCode(),
                    l.quantity(), l.net(), l.vat(), l.description(), l.sellerCode(),
                    l.gtin() == null ? "" : "<cac:StandardItemIdentification><cbc:ID schemeID=\"010\">" + l.gtin()
                            + "</cbc:ID></cac:StandardItemIdentification>"));
        }
        return xml.append("</Invoice>\n").toString();
    }

    /** El AttachedDocument que llega por correo: la factura va adentro como CDATA. */
    public static String attached(String invoiceXml) {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"
                    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
                  <cbc:ID>1</cbc:ID>
                  <cac:Attachment><cac:ExternalReference><cbc:MimeCode>text/xml</cbc:MimeCode>
                    <cbc:Description><![CDATA[%s]]></cbc:Description>
                  </cac:ExternalReference></cac:Attachment>
                </AttachedDocument>
                """.formatted(invoiceXml);
    }

    /** ZIP como el del correo: el PDF y el XML. */
    public static byte[] zip(String xml) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("fv0123.pdf"));
            zip.write("%PDF-1.4 falso".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("ad0123.xml"));
            zip.write(xml.getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        return out.toByteArray();
    }
}
