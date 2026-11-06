package com.poshibrido.purchasing.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedInvoice;
import com.poshibrido.purchasing.application.DianInvoiceParser.ParsedLine;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Cargar la factura del proveedor para llenar la recepción (decisión 290). Guarda el archivo como soporte (en el esquema
 * del negocio), lo lee y empareja cada línea con un producto: primero lo aprendido de ese proveedor ("su código → nuestro
 * producto"), luego el código de barras o el SKU, y por último un nombre parecido (que se marca para revisar). Nunca
 * registra nada: devuelve un borrador que una persona revisa y confirma en "Recibir mercancía".
 */
@Service
@RequiredArgsConstructor
public class InvoiceDocumentService {

    public static final int MAX_BYTES = 5 * 1024 * 1024;
    /** Lo que se subió y nunca se usó en una compra se borra a los 2 días. */
    static final int UNUSED_DAYS = 2;
    static final double NAME_MATCH = 0.6;
    static final double NAME_CANDIDATE = 0.3;

    @PersistenceContext
    private EntityManager em;

    private final AuditLogger audit;

    // ------------------------------------------------------------------ vistas

    /** El proveedor de la factura: {@code id} null si no está registrado (se ofrece crearlo con estos datos). */
    public record SupplierGuess(UUID id, String name, String documentNumber, Integer verificationDigit, boolean active) {
    }

    /** Cómo se encontró el producto: MEMORY (aprendido), BARCODE, SKU o NAME (parecido: revisar). */
    public record LineMatch(UUID productId, UUID unitId, String by, BigDecimal lastCost) {
    }

    public record Candidate(UUID productId, String name, String sku) {
    }

    public record DraftLine(int lineNo, String description, String supplierCode, String barcode, String unitCode,
                            boolean packageUnit, BigDecimal quantity, BigDecimal unitCost, BigDecimal taxRate,
                            BigDecimal discount, String lotNumber, LocalDate expirationDate, LineMatch match,
                            List<Candidate> candidates) {
    }

    public record InvoiceDraft(UUID documentId, String kind, String fileName, SupplierGuess supplier,
                               String invoiceNumber, LocalDate invoiceDate, LocalDate dueDate, String paymentType,
                               String cufe, BigDecimal subtotal, BigDecimal taxTotal, BigDecimal total,
                               boolean alreadyRegistered, List<DraftLine> lines, List<String> warnings) {
    }

    public record StoredFile(String fileName, String contentType, byte[] content) {
    }

    // ------------------------------------------------------------------ cargar

    @Transactional
    public InvoiceDraft upload(String originalName, byte[] bytes) {
        UUID actor = CurrentActor.requireUserId();
        if (bytes == null || bytes.length == 0) {
            throw new BusinessRuleException("El archivo está vacío.");
        }
        if (bytes.length > MAX_BYTES) {
            throw new BusinessRuleException("El archivo supera 5 MB.");
        }
        // Se reconoce por el contenido (la firma), nunca por el nombre ni por lo que diga el navegador.
        String kind;
        String contentType;
        if (DianInvoiceParser.isZip(bytes)) {
            kind = "ZIP";
            contentType = "application/zip";
        } else if (DianInvoiceParser.isXml(bytes)) {
            kind = "XML";
            contentType = "application/xml";
        } else {
            throw new BusinessRuleException("Sube el XML o el ZIP de la factura electrónica (el que llega al correo "
                    + "con el PDF).");
        }
        ParsedInvoice parsed = DianInvoiceParser.parse(bytes);
        return importParsed(kind, contentType, safeName(originalName, kind), bytes, parsed, actor,
                "PURCHASE_INVOICE_IMPORTED", List.of());
    }

    /**
     * La factura leída con IA de sus fotos o su PDF (decisión 295): se guarda como soporte (las fotos ya reducidas, o
     * en un ZIP si son varias) y se empareja igual que el XML. Lo leído llega con un aviso para revisarlo todo.
     */
    @Transactional
    public InvoiceDraft fromScan(String kind, String contentType, String fileName, byte[] bytes, ParsedInvoice parsed) {
        return importParsed(kind, contentType, fileName, bytes, parsed, CurrentActor.requireUserId(),
                "PURCHASE_INVOICE_SCANNED",
                List.of("Leída con IA: revisa cada producto, cantidad y costo contra la factura antes de registrar."));
    }

    private InvoiceDraft importParsed(String kind, String contentType, String fileName, byte[] bytes,
                                      ParsedInvoice parsed, UUID actor, String action, List<String> notices) {
        em.createNativeQuery("""
                DELETE FROM purchase_documents d WHERE d.uploaded_at < ?1
                  AND NOT EXISTS (SELECT 1 FROM purchase_receipts r WHERE r.document_id = d.id)""")
                .setParameter(1, Timestamp.from(Instant.now().minus(UNUSED_DAYS, ChronoUnit.DAYS))).executeUpdate();
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO purchase_documents (id, kind, file_name, content_type, size_bytes, sha256, content,
                    supplier_nit, invoice_number, cufe, uploaded_by, uploaded_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)""")
                .setParameter(1, id).setParameter(2, kind).setParameter(3, fileName).setParameter(4, contentType)
                .setParameter(5, bytes.length).setParameter(6, sha256(bytes)).setParameter(7, bytes)
                .setParameter(8, parsed.supplier().nit()).setParameter(9, parsed.number())
                .setParameter(10, parsed.cufe()).setParameter(11, actor)
                .setParameter(12, Timestamp.from(Instant.now())).executeUpdate();

        SupplierGuess supplier = supplier(parsed);
        boolean registered = supplier.id() != null && !em.createNativeQuery(
                "SELECT 1 FROM purchase_receipts WHERE supplier_id = ?1 AND supplier_invoice = ?2")
                .setParameter(1, supplier.id()).setParameter(2, parsed.number()).getResultList().isEmpty();
        List<DraftLine> lines = match(supplier.id(), parsed.lines());

        List<String> warnings = new ArrayList<>(notices);
        if (supplier.id() == null) {
            warnings.add("El proveedor " + nameOrNit(parsed) + " no está registrado: créalo para continuar.");
        } else if (!supplier.active()) {
            warnings.add("El proveedor está inactivo: actívalo en Proveedores.");
        }
        if (registered) {
            warnings.add("La factura " + parsed.number() + " de este proveedor ya está registrada.");
        }
        if (parsed.globalDiscount().signum() > 0) {
            warnings.add("La factura trae un descuento general de $" + parsed.globalDiscount().toPlainString()
                    + " que no está en las líneas: repártelo en los costos si aplica.");
        }
        if (parsed.otherTaxes()) {
            warnings.add("La factura trae otros impuestos además del IVA (INC, bolsas…): revisa los costos.");
        }
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal tax = BigDecimal.ZERO;
        for (DraftLine l : lines) {
            BigDecimal net = l.quantity().multiply(l.unitCost()).setScale(2, RoundingMode.HALF_UP);
            subtotal = subtotal.add(net);
            tax = tax.add(DianInvoiceParser.tax(net, l.taxRate()));
        }
        BigDecimal total = subtotal.add(tax);
        if (parsed.payable() != null && parsed.globalDiscount().signum() == 0 && !parsed.otherTaxes()
                && total.subtract(parsed.payable()).abs().compareTo(tolerance(parsed.payable())) > 0) {
            warnings.add("Las líneas suman $" + total.toPlainString() + " y la factura dice $"
                    + parsed.payable().toPlainString() + ": revisa cantidades y costos.");
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", kind);
        data.put("file", fileName);
        data.put("supplierNit", parsed.supplier().nit());
        data.put("invoice", parsed.number());
        data.put("lines", lines.size());
        data.put("matched", lines.stream().filter(l -> l.match() != null).count());
        audit.log(action, "purchase_document", id, null, data);

        return new InvoiceDraft(id, kind, fileName, supplier, parsed.number(), parsed.issueDate(), parsed.dueDate(),
                parsed.paymentType(), parsed.cufe(), parsed.subtotal(), parsed.taxTotal(),
                parsed.payable(), registered, lines, warnings);
    }

    /** El archivo de soporte de una compra (o uno recién subido). */
    @Transactional(readOnly = true)
    public StoredFile file(UUID id) {
        List<?> rows = em.createNativeQuery("SELECT file_name, content_type, content FROM purchase_documents WHERE id = ?1")
                .setParameter(1, id).getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Archivo no encontrado.");
        }
        Object[] r = (Object[]) rows.getFirst();
        return new StoredFile((String) r[0], (String) r[1], (byte[]) r[2]);
    }

    // ------------------------------------------------------------------ proveedor

    private SupplierGuess supplier(ParsedInvoice parsed) {
        String nit = parsed.supplier().nit();
        if (nit != null) {
            // El NIT a veces llega con el dígito de verificación pegado: se prueba también sin el último dígito.
            List<String> options = new ArrayList<>(List.of(nit));
            if (parsed.supplier().verificationDigit() == null && nit.length() > 6) {
                options.add(nit.substring(0, nit.length() - 1));
            }
            for (String number : options) {
                List<?> rows = em.createNativeQuery("""
                        SELECT p.id, coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, ''))),
                               s.active, p.verification_digit
                        FROM parties p JOIN suppliers s ON s.party_id = p.id
                        WHERE p.document_number = ?1 ORDER BY s.active DESC LIMIT 1""")
                        .setParameter(1, number).getResultList();
                if (!rows.isEmpty()) {
                    Object[] r = (Object[]) rows.getFirst();
                    return new SupplierGuess((UUID) r[0], (String) r[1], number,
                            r[3] == null ? parsed.supplier().verificationDigit() : ((Number) r[3]).intValue(),
                            Boolean.TRUE.equals(r[2]));
                }
            }
        }
        return new SupplierGuess(null, parsed.supplier().name(), nit, parsed.supplier().verificationDigit(), false);
    }

    private static String nameOrNit(ParsedInvoice parsed) {
        String name = parsed.supplier().name();
        String nit = parsed.supplier().nit();
        return (name == null ? "" : name) + (nit == null ? "" : " (NIT " + nit + ")");
    }

    // ------------------------------------------------------------------ emparejar

    private List<DraftLine> match(UUID supplierId, List<ParsedLine> parsed) {
        Set<UUID> fromSupplier = new HashSet<>();
        if (supplierId != null) {
            for (Object id : em.createNativeQuery("""
                    SELECT DISTINCT l.product_id FROM purchase_receipt_lines l
                    JOIN purchase_receipts r ON r.id = l.receipt_id WHERE r.supplier_id = ?1""")
                    .setParameter(1, supplierId).getResultList()) {
                fromSupplier.add((UUID) id);
            }
        }
        List<DraftLine> result = new ArrayList<>();
        for (ParsedLine l : parsed) {
            LineMatch match = null;
            List<Candidate> candidates = List.of();
            String code = norm(l.sellerCode());
            if (supplierId != null && code != null) {
                match = first(em.createNativeQuery("""
                        SELECT c.product_id, c.unit_id FROM supplier_product_codes c JOIN products p ON p.id = c.product_id
                        WHERE c.supplier_id = ?1 AND c.supplier_code = ?2 AND p.active AND p.track_inventory""")
                        .setParameter(1, supplierId).setParameter(2, code), "MEMORY");
            }
            for (String barcode : codes(l)) {
                if (match != null) {
                    break;
                }
                match = first(em.createNativeQuery("""
                        SELECT b.product_id, b.unit_id FROM product_barcodes b JOIN products p ON p.id = b.product_id
                        WHERE b.barcode = ?1 AND p.active AND p.track_inventory""").setParameter(1, barcode), "BARCODE");
                if (match == null) {
                    match = first(em.createNativeQuery("""
                            SELECT p.id, CAST(NULL AS uuid) FROM products p
                            WHERE upper(p.sku) = ?1 AND p.active AND p.track_inventory""")
                            .setParameter(1, barcode), "SKU");
                }
            }
            if (match == null) {
                List<Scored> scored = byName(l.description(), fromSupplier);
                if (!scored.isEmpty() && scored.getFirst().score() >= NAME_MATCH
                        && (scored.size() == 1 || scored.getFirst().score() - scored.get(1).score() >= 0.1)) {
                    match = new LineMatch(scored.getFirst().id(), null, "NAME", null);
                }
                candidates = scored.stream().filter(s -> s.score() >= NAME_CANDIDATE).limit(3)
                        .map(s -> new Candidate(s.id(), s.name(), s.sku())).toList();
            }
            if (match != null) {
                match = new LineMatch(match.productId(), match.unitId(), match.by(), lastCost(match.productId()));
            }
            result.add(new DraftLine(l.lineNo(), l.description(), l.sellerCode(), l.standardCode(), l.unitCode(),
                    l.packageUnit(), l.quantity(), l.unitCost(), l.taxRate(), l.discount(), l.lotNumber(),
                    l.expirationDate(), match, candidates));
        }
        return result;
    }

    /** Códigos para buscar como código de barras o SKU: el estándar (GTIN) y el del vendedor. */
    private static List<String> codes(ParsedLine l) {
        Set<String> result = new LinkedHashSet<>();
        for (String c : new String[]{l.standardCode(), l.sellerCode()}) {
            String n = norm(c);
            if (n != null && n.matches("[A-Z0-9.\\-]{1,48}")) {
                result.add(n);
            }
        }
        return new ArrayList<>(result);
    }

    private static LineMatch first(Query q, String by) {
        List<?> rows = q.setMaxResults(1).getResultList();
        if (rows.isEmpty()) {
            return null;
        }
        Object[] r = (Object[]) rows.getFirst();
        return new LineMatch((UUID) r[0], (UUID) r[1], by, null);
    }

    /** Costo por unidad base de la última compra aceptada del producto (o el promedio si nunca se compró). */
    private BigDecimal lastCost(UUID productId) {
        List<?> rows = em.createNativeQuery("""
                SELECT round(l.unit_cost / l.factor, 2) FROM purchase_receipt_lines l
                JOIN purchase_receipts r ON r.id = l.receipt_id
                WHERE l.product_id = ?1 AND l.status = 'ACCEPTED' ORDER BY r.received_at DESC, l.line_no LIMIT 1""")
                .setParameter(1, productId).getResultList();
        if (!rows.isEmpty()) {
            return (BigDecimal) rows.getFirst();
        }
        List<?> cost = em.createNativeQuery("SELECT cost FROM products WHERE id = ?1").setParameter(1, productId)
                .getResultList();
        BigDecimal c = cost.isEmpty() ? null : (BigDecimal) cost.getFirst();
        return c == null || c.signum() == 0 ? null : c.setScale(2, RoundingMode.HALF_UP);
    }

    private record Scored(UUID id, String name, String sku, double score) {
    }

    /**
     * Productos con nombre parecido: se buscan por las palabras más largas de la descripción y se puntúan por las
     * palabras en común (las cantidades como "500MG" pesan el doble). Lo comprado antes a este proveedor suma.
     */
    private List<Scored> byName(String description, Set<UUID> fromSupplier) {
        List<String> words = words(description);
        if (words.isEmpty()) {
            return List.of();
        }
        List<String> longest = words.stream().filter(w -> w.length() >= 3).sorted(Comparator.comparingInt(String::length)
                .reversed()).limit(3).toList();
        if (longest.isEmpty()) {
            return List.of();
        }
        StringBuilder sql = new StringBuilder("""
                SELECT p.id, p.name, p.sku FROM products p WHERE p.active AND p.track_inventory AND (""");
        for (int i = 0; i < longest.size(); i++) {
            sql.append(i == 0 ? "" : " OR ").append("translate(lower(p.name), 'áéíóúüñ', 'aeiouun') LIKE ?").append(i + 1);
        }
        sql.append(") LIMIT 200");
        Query q = em.createNativeQuery(sql.toString());
        for (int i = 0; i < longest.size(); i++) {
            q.setParameter(i + 1, "%" + longest.get(i).toLowerCase(Locale.ROOT).replace("%", "").replace("_", "") + "%");
        }
        Set<String> mine = new HashSet<>(words);
        List<Scored> result = new ArrayList<>();
        for (Object row : q.getResultList()) {
            Object[] r = (Object[]) row;
            Set<String> theirs = new HashSet<>(words((String) r[1]));
            double common = 0;
            double size = 0;
            for (String w : mine) {
                double weight = w.matches(".*\\d.*") ? 2 : 1;
                size += weight;
                if (theirs.contains(w)) {
                    common += weight;
                }
            }
            for (String w : theirs) {
                size += w.matches(".*\\d.*") ? 2 : 1;
            }
            double score = size == 0 ? 0 : 2 * common / size;
            if (fromSupplier.contains((UUID) r[0])) {
                score = Math.min(1, score + 0.15);
            }
            result.add(new Scored((UUID) r[0], (String) r[1], (String) r[2], score));
        }
        result.sort(Comparator.comparingDouble(Scored::score).reversed());
        return result;
    }

    /** Palabras en mayúsculas, sin tildes ni signos; "500 MG" queda como "500MG". */
    static List<String> words(String text) {
        if (text == null) {
            return List.of();
        }
        String plain = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toUpperCase(Locale.ROOT)
                .replaceAll("(\\d)[\\s]+(MG|ML|G|GR|KG|L|LT|MCG|UI|CM|MM|OZ|X)\\b", "$1$2")
                .replaceAll("[^A-Z0-9]+", " ").trim();
        if (plain.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String w : plain.split(" ")) {
            if (!w.isEmpty() && !Set.of("DE", "LA", "EL", "Y", "CON", "SIN", "X", "POR", "PARA", "EN").contains(w)) {
                result.add(w);
            }
        }
        return result;
    }

    // ------------------------------------------------------------------ utilidades

    static String norm(String code) {
        if (code == null) {
            return null;
        }
        String c = code.trim().toUpperCase(Locale.ROOT);
        return c.isEmpty() || c.length() > 60 ? null : c;
    }

    private static BigDecimal tolerance(BigDecimal total) {
        BigDecimal half = total.abs().multiply(new BigDecimal("0.005"));
        BigDecimal min = new BigDecimal("100");
        return half.max(min);
    }

    private static String safeName(String name, String kind) {
        String base = name == null ? "" : name.replaceAll("[^A-Za-z0-9._ -]", "_").trim();
        if (base.isEmpty()) {
            base = "factura." + kind.toLowerCase(Locale.ROOT);
        }
        return base.length() > 160 ? base.substring(base.length() - 160) : base;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
