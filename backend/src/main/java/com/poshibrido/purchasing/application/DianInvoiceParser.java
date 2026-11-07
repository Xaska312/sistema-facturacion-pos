package com.poshibrido.purchasing.application;

import com.poshibrido.shared.error.BusinessRuleException;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Lee la factura electrónica de la DIAN (UBL 2.1, decisión 290): el XML de la factura ({@code Invoice}) o el
 * {@code AttachedDocument} que llega por correo (la factura va adentro, en un CDATA), solo o dentro del ZIP.
 * <p>
 * Seguro ante archivos maliciosos: sin DOCTYPE ni entidades externas (XXE), y el ZIP con límite de entradas y de tamaño
 * descomprimido (bomba ZIP). Lo que se lee son datos: nunca se interpretan como instrucciones.
 */
public final class DianInvoiceParser {

    static final int MAX_ZIP_ENTRIES = 20;
    static final int MAX_XML_BYTES = 5 * 1024 * 1024;
    static final int MAX_LINES = 300;
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    /** Unidades de empaque (UN/ECE rec. 20): la presentación hay que elegirla, no es la unidad suelta. */
    private static final Set<String> PACKAGE_UNITS = Set.of("BX", "PK", "CS", "CT", "CA", "DZN", "PA", "BG", "PL",
            "CR", "BO", "SET", "PR", "RO", "TU", "BE", "BL", "XBX", "XPK", "XCS", "XCT");
    private static final Pattern LOT = Pattern.compile("\\bLOTE?\\s*(?:N[O°º.]*)?[:#.\\s-]*([A-Z0-9][A-Z0-9./_-]{1,39})",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern EXPIRY = Pattern.compile(
            "\\b(?:F(?:ECHA)?\\.?\\s*)?(?:VENC(?:IMIENTO|E|\\.)?|VTO|FV|EXP)\\.?\\s*[:.\\s-]*"
                    + "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{1,2}/\\d{4}|\\d{1,2}-\\d{4})",
            Pattern.CASE_INSENSITIVE);

    private DianInvoiceParser() {
    }

    public record ParsedSupplier(String nit, Integer verificationDigit, String name) {
    }

    /**
     * Una línea de la factura. {@code color} y {@code sizes} (decisión 301): solo en ropa y calzado leídos con IA,
     * cuando la factura reparte la línea por tallas; vacíos en las demás.
     */
    public record ParsedLine(int lineNo, String description, String sellerCode, String standardCode, String unitCode,
                             boolean packageUnit, BigDecimal quantity, BigDecimal unitCost, BigDecimal taxRate,
                             BigDecimal discount, String lotNumber, LocalDate expirationDate, String color,
                             List<SizeQuantity> sizes) {

        public ParsedLine {
            sizes = sizes == null ? List.of() : List.copyOf(sizes);
        }

        public ParsedLine(int lineNo, String description, String sellerCode, String standardCode, String unitCode,
                          boolean packageUnit, BigDecimal quantity, BigDecimal unitCost, BigDecimal taxRate,
                          BigDecimal discount, String lotNumber, LocalDate expirationDate) {
            this(lineNo, description, sellerCode, standardCode, unitCode, packageUnit, quantity, unitCost, taxRate,
                    discount, lotNumber, expirationDate, null, List.of());
        }
    }

    /** Cuántos llegaron de una talla. */
    public record SizeQuantity(String size, BigDecimal quantity) {
    }

    public record ParsedInvoice(ParsedSupplier supplier, String number, LocalDate issueDate, LocalDate dueDate,
                                String paymentType, String cufe, BigDecimal subtotal, BigDecimal taxTotal,
                                BigDecimal payable, BigDecimal globalDiscount, boolean otherTaxes,
                                List<ParsedLine> lines) {
    }

    /** ¿Es un ZIP? (firma PK\3\4). */
    public static boolean isZip(byte[] bytes) {
        return bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 3 && bytes[3] == 4;
    }

    /** ¿Parece XML? (empieza con "<", después de un BOM o espacios). */
    public static boolean isXml(byte[] bytes) {
        int i = 0;
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            i = 3;
        }
        while (i < bytes.length && i < 200 && Character.isWhitespace(bytes[i])) {
            i++;
        }
        return i < bytes.length && bytes[i] == '<';
    }

    /** Lee un XML suelto o el primer XML del ZIP que sea una factura. */
    public static ParsedInvoice parse(byte[] bytes) {
        if (isZip(bytes)) {
            BusinessRuleException last = null;
            for (byte[] xml : xmlEntries(bytes)) {
                try {
                    return parseXml(xml);
                } catch (BusinessRuleException e) {
                    last = e;
                }
            }
            throw last != null ? last : new BusinessRuleException("El ZIP no trae el XML de la factura electrónica.");
        }
        if (isXml(bytes)) {
            return parseXml(bytes);
        }
        throw new BusinessRuleException("El archivo no es el XML ni el ZIP de una factura electrónica.");
    }

    // ------------------------------------------------------------------ ZIP

    private static List<byte[]> xmlEntries(byte[] zip) {
        List<byte[]> result = new ArrayList<>();
        int entries = 0;
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            ZipEntry entry;
            while ((entry = in.getNextEntry()) != null) {
                if (++entries > MAX_ZIP_ENTRIES) {
                    throw new BusinessRuleException("El ZIP trae demasiados archivos: sube solo el de la factura.");
                }
                String name = entry.getName().toLowerCase(Locale.ROOT);
                if (entry.isDirectory() || !name.endsWith(".xml")) {
                    continue;
                }
                result.add(readLimited(in));
            }
        } catch (IOException e) {
            throw new BusinessRuleException("No se pudo abrir el ZIP: puede estar dañado.");
        }
        return result;
    }

    private static byte[] readLimited(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int n;
        while ((n = in.read(buffer)) > 0) {
            total += n;
            if (total > MAX_XML_BYTES) {
                throw new BusinessRuleException("El XML de la factura es demasiado grande.");
            }
            out.write(buffer, 0, n);
        }
        return out.toByteArray();
    }

    // ------------------------------------------------------------------ XML

    private static DocumentBuilder builder() {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            DocumentBuilder b = f.newDocumentBuilder();
            b.setErrorHandler(null);
            return b;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static Document read(InputSource source) {
        try {
            return builder().parse(source);
        } catch (Exception e) {
            throw new BusinessRuleException("El XML no se pudo leer: no parece una factura electrónica válida.");
        }
    }

    static ParsedInvoice parseXml(byte[] bytes) {
        Document doc = read(new InputSource(new ByteArrayInputStream(bytes)));
        Element root = doc.getDocumentElement();
        String kind = root.getLocalName();
        if ("AttachedDocument".equals(kind)) {
            // La factura va como texto dentro de cac:Attachment/cac:ExternalReference/cbc:Description.
            Element attachment = child(root, "Attachment");
            Element reference = attachment == null ? null : child(attachment, "ExternalReference");
            String embedded = reference == null ? null : text(child(reference, "Description"));
            if (embedded == null || embedded.isBlank()) {
                throw new BusinessRuleException("El documento adjunto no trae la factura adentro.");
            }
            root = read(new InputSource(new StringReader(embedded.trim()))).getDocumentElement();
            kind = root.getLocalName();
        }
        if ("CreditNote".equals(kind) || "DebitNote".equals(kind)) {
            throw new BusinessRuleException("Es una nota " + ("CreditNote".equals(kind) ? "crédito" : "débito")
                    + ", no una factura: una devolución se registra desde la compra.");
        }
        if (!"Invoice".equals(kind)) {
            throw new BusinessRuleException("El XML no es una factura electrónica (UBL 2.1).");
        }
        return invoice(root);
    }

    private static ParsedInvoice invoice(Element inv) {
        String number = text(child(inv, "ID"));
        if (number == null) {
            throw new BusinessRuleException("La factura no trae número.");
        }
        LocalDate issue = date(text(child(inv, "IssueDate")));
        LocalDate due = date(text(child(inv, "DueDate")));
        String paymentType = null;
        Element means = child(inv, "PaymentMeans");
        if (means != null) {
            String id = text(child(means, "ID"));
            paymentType = "1".equals(id) ? "PAID" : "2".equals(id) ? "CREDIT" : null;
            if (due == null) {
                due = date(text(child(means, "PaymentDueDate")));
            }
        }
        ParsedSupplier supplier = supplier(child(inv, "AccountingSupplierParty"));

        BigDecimal globalDiscount = BigDecimal.ZERO;
        for (Element ac : children(inv, "AllowanceCharge")) {
            if ("false".equalsIgnoreCase(text(child(ac, "ChargeIndicator")))) {
                globalDiscount = globalDiscount.add(amount(text(child(ac, "Amount"))));
            }
        }
        boolean otherTaxes = false;
        BigDecimal taxTotal = BigDecimal.ZERO;
        for (Element tt : children(inv, "TaxTotal")) {
            for (Element sub : children(tt, "TaxSubtotal")) {
                String scheme = taxScheme(sub);
                if ("01".equals(scheme)) {
                    taxTotal = taxTotal.add(amount(text(child(sub, "TaxAmount"))));
                } else if (scheme != null && amount(text(child(sub, "TaxAmount"))).signum() > 0) {
                    otherTaxes = true;
                }
            }
        }
        Element totals = child(inv, "LegalMonetaryTotal");
        BigDecimal subtotal = totals == null ? null : amountOrNull(text(child(totals, "LineExtensionAmount")));
        BigDecimal payable = totals == null ? null : amountOrNull(text(child(totals, "PayableAmount")));

        List<ParsedLine> lines = new ArrayList<>();
        for (Element line : children(inv, "InvoiceLine")) {
            if (lines.size() >= MAX_LINES) {
                throw new BusinessRuleException("La factura trae más de " + MAX_LINES + " productos.");
            }
            lines.add(line(line, lines.size() + 1));
        }
        if (lines.isEmpty()) {
            throw new BusinessRuleException("La factura no trae productos.");
        }
        return new ParsedInvoice(supplier, clip(number.toUpperCase(Locale.ROOT), 40), issue, due, paymentType,
                clip(text(child(inv, "UUID")), 120), subtotal, taxTotal.setScale(2, RoundingMode.HALF_UP), payable,
                globalDiscount.setScale(2, RoundingMode.HALF_UP), otherTaxes, lines);
    }

    private static ParsedSupplier supplier(Element asp) {
        Element party = asp == null ? null : child(asp, "Party");
        if (party == null) {
            return new ParsedSupplier(null, null, null);
        }
        Element scheme = child(party, "PartyTaxScheme");
        Element legal = child(party, "PartyLegalEntity");
        Element id = scheme == null ? null : child(scheme, "CompanyID");
        if (id == null && legal != null) {
            id = child(legal, "CompanyID");
        }
        String nit = id == null ? null : digits(text(id));
        Integer dv = null;
        if (id != null) {
            String raw = id.getAttribute("schemeID");
            if (raw != null && raw.matches("\\d")) {
                dv = Integer.parseInt(raw);
            }
        }
        String name = scheme == null ? null : text(child(scheme, "RegistrationName"));
        if (name == null && legal != null) {
            name = text(child(legal, "RegistrationName"));
        }
        if (name == null) {
            Element partyName = child(party, "PartyName");
            name = partyName == null ? null : text(child(partyName, "Name"));
        }
        return new ParsedSupplier(nit == null || nit.isEmpty() ? null : clip(nit, 20), dv, clip(name, 200));
    }

    private static ParsedLine line(Element line, int lineNo) {
        Element qtyEl = child(line, "InvoicedQuantity");
        BigDecimal quantity = amount(text(qtyEl));
        String unitCode = qtyEl == null ? null : blankToNull(qtyEl.getAttribute("unitCode"));
        BigDecimal net = amount(text(child(line, "LineExtensionAmount")));
        BigDecimal discount = BigDecimal.ZERO;
        for (Element ac : children(line, "AllowanceCharge")) {
            if ("false".equalsIgnoreCase(text(child(ac, "ChargeIndicator")))) {
                discount = discount.add(amount(text(child(ac, "Amount"))));
            }
        }
        BigDecimal rate = BigDecimal.ZERO;
        for (Element tt : children(line, "TaxTotal")) {
            for (Element sub : children(tt, "TaxSubtotal")) {
                if ("01".equals(taxScheme(sub))) {
                    Element category = child(sub, "TaxCategory");
                    BigDecimal percent = amountOrNull(text(category == null ? null : child(category, "Percent")));
                    if (percent == null) {
                        percent = amountOrNull(text(child(sub, "Percent")));
                    }
                    if (percent != null) {
                        rate = percent;
                    }
                }
            }
        }
        Element item = child(line, "Item");
        String description = item == null ? null : text(child(item, "Description"));
        String sellerCode = null;
        String standardCode = null;
        String lot = null;
        LocalDate expiry = null;
        StringBuilder notes = new StringBuilder(description == null ? "" : description);
        if (item != null) {
            Element seller = child(item, "SellersItemIdentification");
            sellerCode = seller == null ? null : text(child(seller, "ID"));
            Element standard = child(item, "StandardItemIdentification");
            standardCode = standard == null ? null : text(child(standard, "ID"));
            Element instance = child(item, "ItemInstance");
            Element lotId = instance == null ? null : child(instance, "LotIdentification");
            if (lotId != null) {
                lot = text(child(lotId, "LotNumberID"));
                expiry = date(text(child(lotId, "ExpiryDate")));
            }
            for (Element extra : children(item, "AdditionalInformation")) {
                notes.append(' ').append(text(extra) == null ? "" : text(extra));
            }
        }
        for (Element note : children(line, "Note")) {
            notes.append(' ').append(text(note) == null ? "" : text(note));
        }
        if (lot == null) {
            Matcher m = LOT.matcher(notes);
            lot = m.find() ? m.group(1) : null;
        }
        if (expiry == null) {
            Matcher m = EXPIRY.matcher(notes);
            expiry = m.find() ? looseDate(m.group(1)) : null;
        }
        if (description == null) {
            description = "Producto " + lineNo;
        }
        // Costo unitario sin IVA y ya con el descuento de la línea (el valor de la línea dividido en la cantidad).
        BigDecimal unitCost = quantity.signum() > 0 ? net.divide(quantity, 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        String unit = unitCode == null ? null : unitCode.toUpperCase(Locale.ROOT);
        return new ParsedLine(lineNo, clip(description.replaceAll("\\s+", " ").trim(), 200), clip(sellerCode, 60),
                clip(standardCode, 60), unit, unit != null && PACKAGE_UNITS.contains(unit),
                quantity.setScale(4, RoundingMode.HALF_UP), unitCost, rate.setScale(2, RoundingMode.HALF_UP),
                discount.setScale(2, RoundingMode.HALF_UP), lot == null ? null : clip(lot.toUpperCase(Locale.ROOT), 40),
                expiry);
    }

    private static String taxScheme(Element taxSubtotal) {
        Element category = child(taxSubtotal, "TaxCategory");
        Element scheme = category == null ? null : child(category, "TaxScheme");
        return scheme == null ? null : text(child(scheme, "ID"));
    }

    // ------------------------------------------------------------------ utilidades

    private static Element child(Element parent, String localName) {
        if (parent == null) {
            return null;
        }
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && localName.equals(e.getLocalName())) {
                return e;
            }
        }
        return null;
    }

    private static List<Element> children(Element parent, String localName) {
        List<Element> result = new ArrayList<>();
        if (parent == null) {
            return result;
        }
        NodeList list = parent.getChildNodes();
        for (int i = 0; i < list.getLength(); i++) {
            if (list.item(i) instanceof Element e && localName.equals(e.getLocalName())) {
                result.add(e);
            }
        }
        return result;
    }

    private static String text(Element e) {
        if (e == null) {
            return null;
        }
        String t = e.getTextContent();
        return t == null || t.isBlank() ? null : t.trim();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String clip(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static String digits(String s) {
        return s == null ? null : s.replaceAll("\\D", "");
    }

    private static BigDecimal amount(String s) {
        BigDecimal v = amountOrNull(s);
        return v == null ? BigDecimal.ZERO : v;
    }

    private static BigDecimal amountOrNull(String s) {
        if (s == null) {
            return null;
        }
        try {
            return new BigDecimal(s.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate date(String s) {
        if (s == null) {
            return null;
        }
        try {
            return LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** Vencimiento escrito en la descripción: AAAA-MM-DD, DD/MM/AAAA o MM/AAAA (último día del mes). */
    static LocalDate looseDate(String s) {
        try {
            if (s.matches("\\d{4}-\\d{2}-\\d{2}")) {
                return LocalDate.parse(s);
            }
            if (s.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) {
                return LocalDate.parse(s, DateTimeFormatter.ofPattern("d/M/yyyy"));
            }
            String[] parts = s.split("[/-]");
            return YearMonth.of(Integer.parseInt(parts[1]), Integer.parseInt(parts[0])).atEndOfMonth();
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** IVA del valor sin IVA: usado para cuadrar los totales. */
    static BigDecimal tax(BigDecimal net, BigDecimal rate) {
        return net.multiply(rate).divide(HUNDRED, 2, RoundingMode.HALF_UP);
    }
}
