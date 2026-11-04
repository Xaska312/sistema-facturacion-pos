package com.poshibrido.purchasing.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.inventory.application.LotRegistry;
import com.poshibrido.inventory.application.StockLedger;
import com.poshibrido.inventory.domain.MovementType;
import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.purchasing.application.PurchaseViews.LineView;
import com.poshibrido.purchasing.application.PurchaseViews.Payables;
import com.poshibrido.purchasing.application.PurchaseViews.PaymentView;
import com.poshibrido.purchasing.application.PurchaseViews.ReceiptSummary;
import com.poshibrido.purchasing.application.PurchaseViews.ReceiptView;
import com.poshibrido.purchasing.application.PurchaseViews.ReturnLineView;
import com.poshibrido.purchasing.application.PurchaseViews.ReturnView;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Compras (Fase 13-2, decisión 280): recepción de mercancía contra la factura del proveedor y cuentas por pagar.
 * <ul>
 *   <li>Cada línea se acepta o se rechaza (con motivo). Lo aceptado entra al inventario como compra, con su lote si el
 *       producto lleva lotes, y recalcula el costo promedio; lo rechazado queda registrado sin mover existencias.</li>
 *   <li>Medicamentos, fitoterapéuticos y dispositivos (y lo que se marque) exigen lote y vencimiento; no se recibe nada
 *       vencido. Lo que va en nevera exige la temperatura de llegada entre 2 y 8 °C.</li>
 *   <li>De contado (con su medio; en efectivo sale de la caja de quien paga) o a crédito con vencimiento; abonos
 *       después. Todo queda inmutable.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PurchaseService {

    static final int MAX_LINES = 300;
    static final BigDecimal COLD_MIN = new BigDecimal("2");
    static final BigDecimal COLD_MAX = new BigDecimal("8");
    private static final String REFERENCE_TYPE = "PURCHASE_RECEIPT";
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    @PersistenceContext
    private EntityManager em;

    private final StockLedger ledger;
    private final LotRegistry lots;
    private final BranchApi branches;
    private final CashApi cash;
    private final MemberDirectory members;
    private final AuditLogger audit;
    private final InventoryCatalogApi catalog;
    private final BusinessSettingsApi settings;

    // ------------------------------------------------------------------ comandos

    public record ReceiveCommand(UUID branchId, UUID supplierId, String supplierInvoice, LocalDate invoiceDate,
                                 String paymentType, UUID paymentMethodId, LocalDate dueDate, String paymentReference,
                                 boolean checksConfirmed, BigDecimal coldChainTemperature, String notes,
                                 List<LineCommand> lines) {
    }

    public record LineCommand(UUID productId, UUID unitId, BigDecimal quantity, BigDecimal unitCost, BigDecimal taxRate,
                              String lotNumber, LocalDate expirationDate, String status, String rejectReason) {
    }

    public record PaymentCommand(BigDecimal amount, UUID paymentMethodId, String reference) {
    }

    /** Lo que el servidor necesita saber del producto para recibirlo. */
    private record Pharma(boolean tracksLots, boolean coldChain, String sanitaryRegistration) {
    }

    // ------------------------------------------------------------------ recepción

    @Transactional
    public ReceiptView receive(ReceiveCommand c, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null) {
            if (!IDEMPOTENCY_KEY.matcher(key).matches()) {
                throw new BusinessRuleException("Idempotency-Key inválida.");
            }
            List<?> previous = em.createNativeQuery(
                    "SELECT id FROM purchase_receipts WHERE idempotency_key = ?1 AND received_by = ?2")
                    .setParameter(1, key).setParameter(2, actor).getResultList();
            if (!previous.isEmpty()) {
                return get((UUID) previous.getFirst());
            }
        }
        if (c.branchId() == null || branches.findByIds(List.of(c.branchId())).stream().noneMatch(BranchApi.BranchRef::active)) {
            throw new BusinessRuleException("Elige una sucursal activa.");
        }
        String supplierName = supplierName(c.supplierId(), true);
        String invoice = c.supplierInvoice() == null ? "" : c.supplierInvoice().trim().toUpperCase();
        if (invoice.isEmpty() || invoice.length() > 40) {
            throw new BusinessRuleException("Escribe el número de la factura del proveedor (máximo 40 caracteres).");
        }
        LocalDate today = LocalDate.now(zone());
        if (c.invoiceDate() == null || c.invoiceDate().isAfter(today.plusDays(1))) {
            throw new BusinessRuleException("La fecha de la factura no puede ser futura.");
        }
        if (!c.checksConfirmed()) {
            throw new BusinessRuleException("Confirma la revisión técnica: empaque, etiquetas, registro sanitario, lote y "
                    + "vencimiento de lo que recibes.");
        }
        if (!em.createNativeQuery("SELECT 1 FROM purchase_receipts WHERE supplier_id = ?1 AND supplier_invoice = ?2")
                .setParameter(1, c.supplierId()).setParameter(2, invoice).getResultList().isEmpty()) {
            throw new ConflictException("La factura " + invoice + " de " + supplierName + " ya está registrada.");
        }
        List<LineCommand> lines = c.lines() == null ? List.of() : c.lines();
        if (lines.isEmpty() || lines.size() > MAX_LINES) {
            throw new BusinessRuleException("La recepción lleva entre 1 y " + MAX_LINES + " líneas.");
        }
        boolean credit = "CREDIT".equals(c.paymentType());
        if (!credit && !"PAID".equals(c.paymentType())) {
            throw new BusinessRuleException("Indica si la factura se pagó de contado o queda a crédito.");
        }
        if (credit && (c.dueDate() == null || c.dueDate().isBefore(c.invoiceDate()))) {
            throw new BusinessRuleException("La fecha de vencimiento del crédito debe ser igual o posterior a la de la factura.");
        }
        PaymentMethodRef method = null;
        if (!credit) {
            if (!CurrentActor.permissions().contains("purchases:pay")) {
                throw new ForbiddenException("No tienes permiso para registrar pagos: recíbela a crédito y que la pague "
                        + "quien tenga el permiso.");
            }
            method = requireMethod(c.paymentMethodId());
        }

        // Productos aceptados: se bloquean y entran al inventario (con costo: recalculan el promedio).
        Set<UUID> accepted = new LinkedHashSet<>();
        Set<UUID> all = new HashSet<>();
        for (LineCommand l : lines) {
            if (l.productId() == null) {
                throw new BusinessRuleException("Cada línea necesita un producto.");
            }
            all.add(l.productId());
            if (!"REJECTED".equals(l.status())) {
                accepted.add(l.productId());
            }
        }
        if (accepted.isEmpty()) {
            throw new BusinessRuleException("No aceptaste ningún producto: si devuelves todo el pedido no hay compra "
                    + "que registrar.");
        }
        StockLedger.Session session = ledger.open(Set.of(c.branchId()), accepted, accepted);
        Map<UUID, Pharma> pharma = pharma(all);
        // Los rechazados no se bloquean ni se mueven: solo se valida su unidad.
        Set<UUID> onlyRejected = new HashSet<>(all);
        onlyRejected.removeAll(accepted);
        Map<UUID, StockProduct> rejectedProducts = onlyRejected.isEmpty() ? Map.of() : catalog.stockProducts(onlyRejected);

        UUID id = Ids.newId();
        long number = ((Number) em.createNativeQuery("SELECT nextval('purchase_receipt_seq')").getSingleResult())
                .longValue();
        BigDecimal subtotal = BigDecimal.ZERO.setScale(2);
        BigDecimal tax = BigDecimal.ZERO.setScale(2);
        BigDecimal rejected = BigDecimal.ZERO.setScale(2);
        boolean needsCold = false;
        List<Object[]> rows = new ArrayList<>();
        List<Map<String, Object>> auditLines = new ArrayList<>();
        int lineNo = 0;
        for (LineCommand l : lines) {
            lineNo++;
            if (l.status() != null && !"ACCEPTED".equals(l.status()) && !"REJECTED".equals(l.status())) {
                throw new BusinessRuleException("Estado de línea inválido.");
            }
            boolean ok = !"REJECTED".equals(l.status());
            StockProduct product = ok ? session.product(l.productId())
                    : accepted.contains(l.productId()) ? session.product(l.productId())
                    : rejectedProducts.get(l.productId());
            if (product == null) {
                throw new NotFoundException("Producto no encontrado.");
            }
            Pharma info = pharma.getOrDefault(l.productId(), new Pharma(false, false, null));
            UUID unitId = l.unitId() == null ? product.baseUnitId() : l.unitId();
            BigDecimal factor = product.factors().get(unitId);
            if (factor == null) {
                throw new BusinessRuleException("La unidad indicada no es una presentación de " + product.name() + ".");
            }
            if (l.quantity() == null || l.quantity().signum() <= 0) {
                throw new BusinessRuleException("La cantidad de " + product.name() + " debe ser mayor que cero.");
            }
            BigDecimal quantity = l.quantity().setScale(4, RoundingMode.HALF_UP);
            BigDecimal base = quantity.multiply(factor).setScale(4, RoundingMode.HALF_UP);
            if (base.signum() <= 0 || (!product.baseUnitAllowsDecimals() && base.stripTrailingZeros().scale() > 0)) {
                throw new BusinessRuleException("La cantidad de " + product.name() + " no es válida.");
            }
            if (l.unitCost() == null || l.unitCost().signum() < 0 || l.unitCost().stripTrailingZeros().scale() > 2) {
                throw new BusinessRuleException("Escribe el costo unitario de " + product.name() + " (sin IVA).");
            }
            BigDecimal unitCost = l.unitCost().setScale(2, RoundingMode.HALF_UP);
            BigDecimal rate = l.taxRate() == null ? BigDecimal.ZERO : l.taxRate().setScale(2, RoundingMode.HALF_UP);
            if (rate.signum() < 0 || rate.compareTo(HUNDRED) > 0) {
                throw new BusinessRuleException("El IVA de " + product.name() + " no es válido.");
            }
            BigDecimal net = quantity.multiply(unitCost).setScale(2, RoundingMode.HALF_UP);
            BigDecimal lineTax = net.multiply(rate).divide(HUNDRED, 2, RoundingMode.HALF_UP);
            BigDecimal lineTotal = net.add(lineTax);

            String lotNumber = l.lotNumber() == null || l.lotNumber().isBlank() ? null : LotRegistry.normalize(l.lotNumber());
            LocalDate expiration = l.expirationDate();
            UUID lotId = null;
            String reason = null;
            if (ok) {
                if (info.tracksLots() && (lotNumber == null || expiration == null)) {
                    throw new BusinessRuleException(product.name() + " lleva lote y vencimiento: escríbelos como "
                            + "vienen en el empaque.");
                }
                if (expiration != null && !expiration.isAfter(today)) {
                    throw new BusinessRuleException(product.name() + " (lote " + (lotNumber == null ? "sin lote" : lotNumber)
                            + ") está vencido: recházalo.");
                }
                if (lotNumber != null) {
                    lotId = lots.lotFor(l.productId(), product.name(), lotNumber, expiration);
                }
                needsCold |= info.coldChain();
                subtotal = subtotal.add(net);
                tax = tax.add(lineTax);
            } else {
                reason = l.rejectReason() == null ? "" : l.rejectReason().trim();
                if (reason.isEmpty() || reason.length() > 200) {
                    throw new BusinessRuleException("Escribe por qué rechazas " + product.name() + ".");
                }
                rejected = rejected.add(lineTotal);
            }
            rows.add(new Object[]{Ids.newId(), lineNo, l.productId(), unitId, quantity, factor, base, unitCost, rate,
                    lineTotal, lotId, lotNumber, expiration, info.sanitaryRegistration(), ok ? "ACCEPTED" : "REJECTED",
                    reason, product, net});
            Map<String, Object> al = new LinkedHashMap<>();
            al.put("product", product.name());
            al.put("quantity", quantity);
            al.put("lot", lotNumber);
            al.put("status", ok ? "ACCEPTED" : "REJECTED");
            auditLines.add(al);
        }
        BigDecimal temperature = c.coldChainTemperature() == null ? null
                : c.coldChainTemperature().setScale(1, RoundingMode.HALF_UP);
        if (needsCold) {
            if (temperature == null) {
                throw new BusinessRuleException("Hay productos de nevera: anota la temperatura con que llegaron.");
            }
            if (temperature.compareTo(COLD_MIN) < 0 || temperature.compareTo(COLD_MAX) > 0) {
                throw new BusinessRuleException("Los productos de nevera llegaron a " + temperature.toPlainString()
                        + " °C, fuera de 2 a 8 °C: recházalos.");
            }
        }
        BigDecimal total = subtotal.add(tax);
        String notes = c.notes() == null || c.notes().isBlank() ? null
                : c.notes().trim().substring(0, Math.min(500, c.notes().trim().length()));
        Instant now = Instant.now();
        em.createNativeQuery("""
                INSERT INTO purchase_receipts (id, number, branch_id, supplier_id, supplier_invoice, invoice_date,
                    payment_type, due_date, subtotal, tax_total, total, rejected_total, checks_confirmed,
                    cold_chain_temperature, notes, idempotency_key, received_by, received_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, TRUE, ?13, ?14, ?15, ?16, ?17)""")
                .setParameter(1, id).setParameter(2, number).setParameter(3, c.branchId())
                .setParameter(4, c.supplierId()).setParameter(5, invoice).setParameter(6, Date.valueOf(c.invoiceDate()))
                .setParameter(7, credit ? "CREDIT" : "PAID")
                .setParameter(8, credit ? Date.valueOf(c.dueDate()) : null).setParameter(9, subtotal)
                .setParameter(10, tax).setParameter(11, total).setParameter(12, rejected)
                .setParameter(13, temperature).setParameter(14, notes).setParameter(15, key)
                .setParameter(16, actor).setParameter(17, Timestamp.from(now)).executeUpdate();
        String label = "Compra #" + number + " · " + supplierName + " · factura " + invoice;
        for (Object[] r : rows) {
            em.createNativeQuery("""
                    INSERT INTO purchase_receipt_lines (id, receipt_id, line_no, product_id, unit_id, quantity, factor,
                        base_quantity, unit_cost, tax_rate, line_total, lot_id, lot_number, expiration_date,
                        sanitary_registration, status, reject_reason)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)""")
                    .setParameter(1, r[0]).setParameter(2, id).setParameter(3, r[1]).setParameter(4, r[2])
                    .setParameter(5, r[3]).setParameter(6, r[4]).setParameter(7, r[5]).setParameter(8, r[6])
                    .setParameter(9, r[7]).setParameter(10, r[8]).setParameter(11, r[9]).setParameter(12, r[10])
                    .setParameter(13, r[11]).setParameter(14, r[12] == null ? null : Date.valueOf((LocalDate) r[12]))
                    .setParameter(15, r[13]).setParameter(16, r[14]).setParameter(17, r[15]).executeUpdate();
            if ("ACCEPTED".equals(r[14])) {
                BigDecimal baseCost = ((BigDecimal) r[7]).divide((BigDecimal) r[5], 2, RoundingMode.HALF_UP);
                session.post(c.branchId(), (UUID) r[2], (UUID) r[10], MovementType.PURCHASE, (BigDecimal) r[6],
                        baseCost, false, REFERENCE_TYPE, id, label);
            }
        }
        if (!credit && total.signum() > 0) {
            pay(id, total, method, c.paymentReference(), null, actor, label);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("number", number);
        data.put("supplier", supplierName);
        data.put("invoice", invoice);
        data.put("total", total);
        data.put("rejectedTotal", rejected);
        data.put("payment", credit ? "CREDIT" : method.name());
        data.put("lines", auditLines);
        audit.log("PURCHASE_RECEIVED", "purchase_receipt", id, null, data);
        return get(id);
    }

    // ------------------------------------------------------------------ devoluciones (Fase 13-3)

    public record ReturnCommand(String reason, List<ReturnLine> lines) {
    }

    /** {@code quantity} en la unidad en que se recibió la línea. */
    public record ReturnLine(int receiptLineNo, BigDecimal quantity) {
    }

    /**
     * Devolución al proveedor de lo recibido en una compra (vencido, averiado, retirado del mercado, mal despachado):
     * sale del inventario del lote recibido (SUPPLIER_RETURN, al costo promedio) y su valor (costo de la factura más IVA)
     * baja lo que se le debe. Nunca más de lo aceptado en cada línea.
     */
    @Transactional
    public ReceiptView returnGoods(UUID receiptId, ReturnCommand c, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null) {
            if (!IDEMPOTENCY_KEY.matcher(key).matches()) {
                throw new BusinessRuleException("Idempotency-Key inválida.");
            }
            List<?> previous = em.createNativeQuery(
                    "SELECT receipt_id FROM purchase_returns WHERE idempotency_key = ?1 AND created_by = ?2")
                    .setParameter(1, key).setParameter(2, actor).getResultList();
            if (!previous.isEmpty()) {
                return get((UUID) previous.getFirst());
            }
        }
        List<?> found = em.createNativeQuery(
                "SELECT number, branch_id, supplier_invoice FROM purchase_receipts WHERE id = ?1 FOR UPDATE")
                .setParameter(1, receiptId).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Compra no encontrada.");
        }
        Object[] receipt = (Object[]) found.getFirst();
        long number = ((Number) receipt[0]).longValue();
        UUID branchId = (UUID) receipt[1];
        String reason = c.reason() == null ? "" : c.reason().trim();
        if (reason.isEmpty() || reason.length() > 255) {
            throw new BusinessRuleException("Escribe el motivo de la devolución (máximo 255 caracteres).");
        }
        if (c.lines() == null || c.lines().isEmpty() || c.lines().size() > MAX_LINES) {
            throw new BusinessRuleException("Elige qué devuelves.");
        }
        record Target(UUID lineId, UUID productId, UUID lotId, BigDecimal quantity, BigDecimal factor,
                      BigDecimal unitCost, BigDecimal rate, String name) {
        }
        List<Target> targets = new ArrayList<>();
        Set<Integer> seen = new HashSet<>();
        for (ReturnLine l : c.lines()) {
            if (!seen.add(l.receiptLineNo())) {
                throw new BusinessRuleException("Una línea de la compra aparece dos veces.");
            }
            List<?> rows = em.createNativeQuery("""
                    SELECT l.id, l.product_id, l.lot_id, l.quantity, l.factor, l.unit_cost, l.tax_rate, l.status, p.name,
                           (SELECT coalesce(sum(rl.quantity), 0) FROM purchase_return_lines rl WHERE rl.receipt_line_id = l.id)
                    FROM purchase_receipt_lines l JOIN products p ON p.id = l.product_id
                    WHERE l.receipt_id = ?1 AND l.line_no = ?2""")
                    .setParameter(1, receiptId).setParameter(2, l.receiptLineNo()).getResultList();
            if (rows.isEmpty()) {
                throw new BusinessRuleException("La línea " + l.receiptLineNo() + " no es de esta compra.");
            }
            Object[] r = (Object[]) rows.getFirst();
            String name = (String) r[8];
            if (!"ACCEPTED".equals(r[7])) {
                throw new BusinessRuleException(name + " se rechazó al recibirlo: no entró al inventario.");
            }
            if (l.quantity() == null || l.quantity().signum() <= 0) {
                throw new BusinessRuleException("La cantidad a devolver de " + name + " debe ser mayor que cero.");
            }
            BigDecimal quantity = l.quantity().setScale(4, RoundingMode.HALF_UP);
            BigDecimal pending = ((BigDecimal) r[3]).subtract((BigDecimal) r[9]);
            if (quantity.compareTo(pending) > 0) {
                throw new BusinessRuleException("De " + name + " solo puedes devolver "
                        + pending.stripTrailingZeros().toPlainString() + " (lo recibido menos lo ya devuelto).");
            }
            targets.add(new Target((UUID) r[0], (UUID) r[1], (UUID) r[2], quantity, (BigDecimal) r[4],
                    (BigDecimal) r[5], (BigDecimal) r[6], name));
        }
        Set<UUID> products = new HashSet<>();
        targets.forEach(t -> products.add(t.productId()));
        StockLedger.Session session = ledger.open(Set.of(branchId), products, Set.of(), true);
        UUID returnId = Ids.newId();
        long returnNumber = ((Number) em.createNativeQuery("SELECT nextval('purchase_return_seq')").getSingleResult())
                .longValue();
        String label = "Devolución al proveedor · compra #" + number + " · factura " + receipt[2];
        BigDecimal subtotal = BigDecimal.ZERO.setScale(2);
        BigDecimal tax = BigDecimal.ZERO.setScale(2);
        List<Object[]> lineRows = new ArrayList<>();
        for (Target t : targets) {
            BigDecimal base = t.quantity().multiply(t.factor()).setScale(4, RoundingMode.HALF_UP);
            BigDecimal net = t.quantity().multiply(t.unitCost()).setScale(2, RoundingMode.HALF_UP);
            BigDecimal lineTax = net.multiply(t.rate()).divide(HUNDRED, 2, RoundingMode.HALF_UP);
            subtotal = subtotal.add(net);
            tax = tax.add(lineTax);
            lineRows.add(new Object[]{Ids.newId(), t.lineId(), t.productId(), t.lotId(), t.quantity(), base,
                    t.unitCost(), t.rate(), net.add(lineTax)});
            session.post(branchId, t.productId(), t.lotId(), MovementType.SUPPLIER_RETURN, base.negate(), null, false,
                    REFERENCE_TYPE, receiptId, label);
        }
        BigDecimal total = subtotal.add(tax);
        em.createNativeQuery("""
                INSERT INTO purchase_returns (id, number, receipt_id, branch_id, reason, subtotal, tax_total, total,
                    idempotency_key, created_by, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)""")
                .setParameter(1, returnId).setParameter(2, returnNumber).setParameter(3, receiptId)
                .setParameter(4, branchId).setParameter(5, reason).setParameter(6, subtotal).setParameter(7, tax)
                .setParameter(8, total).setParameter(9, key).setParameter(10, actor)
                .setParameter(11, Timestamp.from(Instant.now())).executeUpdate();
        for (Object[] l : lineRows) {
            em.createNativeQuery("""
                    INSERT INTO purchase_return_lines (id, return_id, receipt_line_id, product_id, lot_id, quantity,
                        base_quantity, unit_cost, tax_rate, line_total)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)""")
                    .setParameter(1, l[0]).setParameter(2, returnId).setParameter(3, l[1]).setParameter(4, l[2])
                    .setParameter(5, l[3]).setParameter(6, l[4]).setParameter(7, l[5]).setParameter(8, l[6])
                    .setParameter(9, l[7]).setParameter(10, l[8]).executeUpdate();
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("receipt", number);
        data.put("return", returnNumber);
        data.put("reason", reason);
        data.put("total", total);
        audit.log("PURCHASE_RETURNED", "purchase_return", returnId, null, data);
        em.flush();
        return get(receiptId);
    }

    // ------------------------------------------------------------------ pagos

    @Transactional
    public PaymentView addPayment(UUID receiptId, PaymentCommand c, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null && !IDEMPOTENCY_KEY.matcher(key).matches()) {
            throw new BusinessRuleException("Idempotency-Key inválida.");
        }
        if (key != null) {
            List<?> previous = em.createNativeQuery(
                    "SELECT id FROM supplier_payments WHERE idempotency_key = ?1 AND paid_by = ?2 AND receipt_id = ?3")
                    .setParameter(1, key).setParameter(2, actor).setParameter(3, receiptId).getResultList();
            if (!previous.isEmpty()) {
                return payments(receiptId).stream().filter(p -> p.id().equals(previous.getFirst())).findFirst()
                        .orElseThrow();
            }
        }
        // Bloqueo de la factura: dos abonos a la vez no pagan de más.
        List<?> found = em.createNativeQuery("""
                SELECT r.number, r.supplier_invoice, r.supplier_id, r.total FROM purchase_receipts r
                WHERE r.id = ?1 FOR UPDATE""").setParameter(1, receiptId).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Compra no encontrada.");
        }
        Object[] r = (Object[]) found.getFirst();
        if (c.amount() == null || c.amount().signum() <= 0 || c.amount().stripTrailingZeros().scale() > 2) {
            throw new BusinessRuleException("Escribe el valor del pago.");
        }
        BigDecimal amount = c.amount().setScale(2, RoundingMode.HALF_UP);
        BigDecimal balance = ((BigDecimal) r[3]).subtract(paidOf(receiptId)).subtract(returnedOf(receiptId));
        if (amount.compareTo(balance) > 0) {
            throw new BusinessRuleException("El pago es mayor que el saldo de la factura ($ "
                    + balance.stripTrailingZeros().toPlainString() + ").");
        }
        PaymentMethodRef method = requireMethod(c.paymentMethodId());
        String label = "Pago compra #" + ((Number) r[0]).longValue() + " · " + supplierName((UUID) r[2], false)
                + " · factura " + r[1];
        UUID paymentId = pay(receiptId, amount, method, c.reference(), key, actor, label);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("receipt", ((Number) r[0]).longValue());
        data.put("amount", amount);
        data.put("method", method.name());
        audit.log("SUPPLIER_PAYMENT_CREATED", "supplier_payment", paymentId, null, data);
        return payments(receiptId).stream().filter(p -> p.id().equals(paymentId)).findFirst().orElseThrow();
    }

    private UUID pay(UUID receiptId, BigDecimal amount, PaymentMethodRef method, String reference, String key,
                     UUID actor, String label) {
        UUID paymentId = Ids.newId();
        UUID cashSession = method.affectsCash() ? cash.recordSupplierPaymentCash(actor, amount, paymentId, label) : null;
        String ref = reference == null || reference.isBlank() ? null
                : reference.trim().substring(0, Math.min(100, reference.trim().length()));
        if (method.requiresReference() && ref == null) {
            throw new BusinessRuleException("Escribe la referencia del pago (" + method.name() + ").");
        }
        em.createNativeQuery("""
                INSERT INTO supplier_payments (id, receipt_id, amount, payment_method_id, cash_session_id, reference,
                    idempotency_key, paid_by, paid_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)""")
                .setParameter(1, paymentId).setParameter(2, receiptId).setParameter(3, amount)
                .setParameter(4, method.id()).setParameter(5, cashSession).setParameter(6, ref).setParameter(7, key)
                .setParameter(8, actor).setParameter(9, Timestamp.from(Instant.now())).executeUpdate();
        return paymentId;
    }

    // ------------------------------------------------------------------ consultas

    @Transactional(readOnly = true)
    public PageResponse<ReceiptSummary> list(UUID supplierId, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 100);
        StringBuilder where = new StringBuilder(" WHERE true");
        Map<String, Object> params = new HashMap<>();
        if (supplierId != null) {
            where.append(" AND r.supplier_id = :supplier");
            params.put("supplier", supplierId);
        }
        long total = ((Number) query("SELECT count(*) FROM purchase_receipts r" + where, params).getSingleResult())
                .longValue();
        List<ReceiptSummary> content = summaries(SUMMARY_SQL + where + " ORDER BY r.received_at DESC LIMIT "
                + s + " OFFSET " + ((long) p * s), params);
        return new PageResponse<>(content, p, s, total, (int) ((total + s - 1) / s));
    }

    @Transactional(readOnly = true)
    public Payables payables(UUID supplierId) {
        Map<String, Object> params = new HashMap<>();
        StringBuilder where = new StringBuilder(" WHERE r.total > coalesce(pay.paid, 0) + coalesce(ret.returned, 0)");
        if (supplierId != null) {
            where.append(" AND r.supplier_id = :supplier");
            params.put("supplier", supplierId);
        }
        List<ReceiptSummary> open = summaries(SUMMARY_SQL + where
                + " ORDER BY coalesce(r.due_date, r.invoice_date), r.number", params);
        LocalDate today = LocalDate.now(zone());
        BigDecimal due = BigDecimal.ZERO.setScale(2);
        BigDecimal overdue = BigDecimal.ZERO.setScale(2);
        BigDecimal soon = BigDecimal.ZERO.setScale(2);
        for (ReceiptSummary r : open) {
            due = due.add(r.balance());
            if (r.dueDate() != null && r.dueDate().isBefore(today)) {
                overdue = overdue.add(r.balance());
            } else if (r.dueDate() != null && !r.dueDate().isAfter(today.plusDays(7))) {
                soon = soon.add(r.balance());
            }
        }
        return new Payables(due, overdue, soon, open);
    }

    @Transactional(readOnly = true)
    public ReceiptView get(UUID id) {
        Map<String, Object> params = Map.of("id", id);
        List<ReceiptSummary> found = summaries(SUMMARY_SQL + " WHERE r.id = :id", params);
        if (found.isEmpty()) {
            throw new NotFoundException("Compra no encontrada.");
        }
        ReceiptSummary s = found.getFirst();
        Object[] extra = (Object[]) query("""
                SELECT subtotal, tax_total, cold_chain_temperature, notes, checks_confirmed
                FROM purchase_receipts WHERE id = :id""", params).getSingleResult();
        List<LineView> lines = new ArrayList<>();
        for (Object row : query("""
                SELECT l.line_no, l.product_id, p.name, p.sku, u.code, l.quantity, l.unit_cost, l.tax_rate,
                       l.line_total, l.lot_number, l.expiration_date, l.sanitary_registration, l.status,
                       l.reject_reason, l.base_quantity,
                       (SELECT coalesce(sum(rl.quantity), 0) FROM purchase_return_lines rl WHERE rl.receipt_line_id = l.id)
                FROM purchase_receipt_lines l JOIN products p ON p.id = l.product_id JOIN units u ON u.id = l.unit_id
                WHERE l.receipt_id = :id ORDER BY l.line_no""", params).getResultList()) {
            Object[] r = (Object[]) row;
            lines.add(new LineView(((Number) r[0]).intValue(), (UUID) r[1], (String) r[2], (String) r[3],
                    (String) r[4], (BigDecimal) r[5], (BigDecimal) r[6], (BigDecimal) r[7], (BigDecimal) r[8],
                    (String) r[9], date(r[10]), (String) r[11],
                    (String) r[12], (String) r[13], (BigDecimal) r[14], (BigDecimal) r[15]));
        }
        return new ReceiptView(s, (BigDecimal) extra[0], (BigDecimal) extra[1], (BigDecimal) extra[2],
                (String) extra[3], (Boolean) extra[4], lines, payments(id), returns(id));
    }

    private static final String SUMMARY_SQL = """
            SELECT r.id, r.number, r.branch_id, b.name, r.supplier_id,
                   coalesce(pt.business_name, trim(coalesce(pt.first_names, '') || ' ' || coalesce(pt.last_names, ''))),
                   r.supplier_invoice, r.invoice_date, r.payment_type, r.due_date, r.total, coalesce(pay.paid, 0),
                   r.rejected_total, r.received_at, r.received_by,
                   (SELECT count(*) FROM purchase_receipt_lines l WHERE l.receipt_id = r.id), coalesce(ret.returned, 0)
            FROM purchase_receipts r
            JOIN branches b ON b.id = r.branch_id
            JOIN parties pt ON pt.id = r.supplier_id
            LEFT JOIN (SELECT receipt_id, sum(amount) AS paid FROM supplier_payments GROUP BY receipt_id) pay
                   ON pay.receipt_id = r.id
            LEFT JOIN (SELECT receipt_id, sum(total) AS returned FROM purchase_returns GROUP BY receipt_id) ret
                   ON ret.receipt_id = r.id""";

    private List<ReceiptSummary> summaries(String sql, Map<String, Object> params) {
        List<Object[]> rows = new ArrayList<>();
        for (Object row : query(sql, params).getResultList()) {
            rows.add((Object[]) row);
        }
        Set<UUID> people = new HashSet<>();
        rows.forEach(r -> people.add((UUID) r[14]));
        Map<UUID, String> names = members.displayNames(people);
        LocalDate today = LocalDate.now(zone());
        List<ReceiptSummary> result = new ArrayList<>();
        for (Object[] r : rows) {
            BigDecimal total = (BigDecimal) r[10];
            BigDecimal paid = ((BigDecimal) r[11]).setScale(2, RoundingMode.HALF_UP);
            LocalDate dueDate = date(r[9]);
            BigDecimal returned = ((BigDecimal) r[16]).setScale(2, RoundingMode.HALF_UP);
            // Lo devuelto al proveedor baja lo que se le debe (Fase 13-3); si ya estaba pagado queda a favor.
            BigDecimal balance = total.subtract(paid).subtract(returned).max(BigDecimal.ZERO.setScale(2));
            result.add(new ReceiptSummary((UUID) r[0], ((Number) r[1]).longValue(), (UUID) r[2], (String) r[3],
                    (UUID) r[4], (String) r[5], (String) r[6], date(r[7]), (String) r[8], dueDate,
                    total, paid, balance, balance.signum() > 0 && dueDate != null && dueDate.isBefore(today),
                    (BigDecimal) r[12], instant(r[13]), names.get((UUID) r[14]),
                    ((Number) r[15]).intValue(), returned));
        }
        return result;
    }

    private List<PaymentView> payments(UUID receiptId) {
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        List<Object[]> rows = new ArrayList<>();
        for (Object row : query("""
                SELECT id, amount, payment_method_id, cash_session_id, reference, paid_at, paid_by
                FROM supplier_payments WHERE receipt_id = :id ORDER BY paid_at""", Map.of("id", receiptId))
                .getResultList()) {
            rows.add((Object[]) row);
        }
        Set<UUID> people = new HashSet<>();
        rows.forEach(r -> people.add((UUID) r[6]));
        Map<UUID, String> names = members.displayNames(people);
        List<PaymentView> result = new ArrayList<>();
        for (Object[] r : rows) {
            PaymentMethodRef m = methods.get((UUID) r[2]);
            result.add(new PaymentView((UUID) r[0], (BigDecimal) r[1], m == null ? "—" : m.name(), r[3] != null,
                    (String) r[4], instant(r[5]), names.get((UUID) r[6])));
        }
        return result;
    }

    private List<ReturnView> returns(UUID receiptId) {
        Map<String, Object> params = Map.of("id", receiptId);
        Map<UUID, List<ReturnLineView>> linesByReturn = new HashMap<>();
        for (Object o : query("""
                SELECT rl.return_id, l.line_no, rl.product_id, p.name, u.code, rl.quantity, lt.lot_number, rl.line_total
                FROM purchase_return_lines rl
                JOIN purchase_returns rt ON rt.id = rl.return_id
                JOIN purchase_receipt_lines l ON l.id = rl.receipt_line_id
                JOIN products p ON p.id = rl.product_id JOIN units u ON u.id = l.unit_id
                LEFT JOIN lots lt ON lt.id = rl.lot_id
                WHERE rt.receipt_id = :id ORDER BY l.line_no""", params).getResultList()) {
            Object[] r = (Object[]) o;
            linesByReturn.computeIfAbsent((UUID) r[0], k -> new ArrayList<>()).add(new ReturnLineView(
                    ((Number) r[1]).intValue(), (UUID) r[2], (String) r[3], (String) r[4], (BigDecimal) r[5],
                    (String) r[6], (BigDecimal) r[7]));
        }
        List<Object[]> rows = new ArrayList<>();
        for (Object o : query("""
                SELECT id, number, reason, subtotal, tax_total, total, created_at, created_by
                FROM purchase_returns WHERE receipt_id = :id ORDER BY number""", params).getResultList()) {
            rows.add((Object[]) o);
        }
        Set<UUID> people = new HashSet<>();
        rows.forEach(r -> people.add((UUID) r[7]));
        Map<UUID, String> names = members.displayNames(people);
        List<ReturnView> result = new ArrayList<>();
        for (Object[] r : rows) {
            result.add(new ReturnView((UUID) r[0], ((Number) r[1]).longValue(), (String) r[2], (BigDecimal) r[3],
                    (BigDecimal) r[4], (BigDecimal) r[5], instant(r[6]), names.get((UUID) r[7]),
                    linesByReturn.getOrDefault((UUID) r[0], List.of())));
        }
        return result;
    }

    private BigDecimal returnedOf(UUID receiptId) {
        Object v = em.createNativeQuery("SELECT coalesce(sum(total), 0) FROM purchase_returns WHERE receipt_id = ?1")
                .setParameter(1, receiptId).getSingleResult();
        return ((BigDecimal) v).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal paidOf(UUID receiptId) {
        Object v = em.createNativeQuery("SELECT coalesce(sum(amount), 0) FROM supplier_payments WHERE receipt_id = ?1")
                .setParameter(1, receiptId).getSingleResult();
        return ((BigDecimal) v).setScale(2, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------ apoyo

    private String supplierName(UUID supplierId, boolean requireActive) {
        if (supplierId == null) {
            throw new BusinessRuleException("Elige el proveedor.");
        }
        List<?> found = em.createNativeQuery("""
                SELECT s.active, coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, '')))
                FROM suppliers s JOIN parties p ON p.id = s.party_id WHERE s.party_id = ?1""")
                .setParameter(1, supplierId).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Proveedor no encontrado.");
        }
        Object[] row = (Object[]) found.getFirst();
        if (requireActive && !Boolean.TRUE.equals(row[0])) {
            throw new BusinessRuleException("El proveedor está inactivo.");
        }
        return (String) row[1];
    }

    private PaymentMethodRef requireMethod(UUID methodId) {
        PaymentMethodRef m = methodId == null ? null : cash.paymentMethods().get(methodId);
        if (m == null || !m.active() || "CREDIT".equals(m.code())) {
            throw new BusinessRuleException("Elige el medio con que pagaste (efectivo, transferencia…).");
        }
        return m;
    }

    private Map<UUID, Pharma> pharma(Set<UUID> productIds) {
        Map<UUID, Pharma> result = new HashMap<>();
        for (Object row : em.createNativeQuery("""
                SELECT p.id, p.tracks_lots, coalesce(m.cold_chain, false), m.sanitary_registration
                FROM products p LEFT JOIN product_medicines m ON m.product_id = p.id WHERE p.id IN (?1)""")
                .setParameter(1, productIds).getResultList()) {
            Object[] r = (Object[]) row;
            result.put((UUID) r[0], new Pharma((Boolean) r[1], (Boolean) r[2], (String) r[3]));
        }
        return result;
    }

    private jakarta.persistence.Query query(String sql, Map<String, Object> params) {
        jakarta.persistence.Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        return q;
    }

    private ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    private static LocalDate date(Object value) {
        return value == null ? null : value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }

    private static Instant instant(Object value) {
        return value instanceof Timestamp t ? t.toInstant() : (Instant) value;
    }
}
