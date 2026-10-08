package com.poshibrido.sales.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.catalog.application.PricingApi.ResolvedPrice;
import com.poshibrido.inventory.application.StockLedger;
import com.poshibrido.inventory.domain.MovementType;
import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.parties.application.CustomerApi.CustomerRef;
import com.poshibrido.sales.application.SaleCommands.Create;
import com.poshibrido.sales.application.SaleCommands.ItemLine;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.sales.application.SaleViews.SaleView;
import com.poshibrido.sales.domain.Sale;
import com.poshibrido.sales.domain.SaleCalculator;
import com.poshibrido.sales.domain.SaleCalculator.LineAmounts;
import com.poshibrido.sales.domain.SaleCalculator.PaymentInput;
import com.poshibrido.sales.domain.SaleCalculator.Settlement;
import com.poshibrido.sales.domain.SaleItem;
import com.poshibrido.sales.domain.SalePayment;
import com.poshibrido.sales.domain.SaleTaxTotal;
import com.poshibrido.sales.infrastructure.DocumentSequences;
import com.poshibrido.sales.infrastructure.SaleItemRepository;
import com.poshibrido.sales.infrastructure.SalePaymentRepository;
import com.poshibrido.sales.infrastructure.SaleRepository;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import com.poshibrido.tenancy.application.CurrentTenant;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Registro y anulación de ventas. Cada operación es una sola transacción con este orden de bloqueos (el mismo en
 * todo el sistema, para evitar interbloqueos): sesión de caja (compartido) → productos y saldos de inventario
 * (StockLedger) → consecutivo.
 */
@Service
public class SaleService {

    /** Máximo de NUMERIC(14,4), la columna de cantidades en unidad base. */
    static final BigDecimal MAX_BASE_QUANTITY = new BigDecimal("9999999999.9999");

    static final String SEQUENCE = "SALE";
    static final String REFERENCE_TYPE = "SALE";
    static final String DISCOUNT_PERMISSION = "sales:discount";
    static final int MAX_ITEMS = 200;
    static final int MAX_PAYMENTS = 10;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final CashApi cash;
    private final StockLedger ledger;
    private final PricingApi pricing;
    private final InventoryCatalogApi catalog;
    private final CustomerApi customers;
    private final BusinessSettingsApi settings;
    private final DocumentSequences sequences;
    private final SaleRepository sales;
    private final SaleItemRepository saleItems;
    private final SalePaymentRepository salePayments;
    private final SaleQueryService queries;
    private final AuditLogger audit;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    public SaleService(CashApi cash, StockLedger ledger, PricingApi pricing, InventoryCatalogApi catalog,
                       CustomerApi customers, BusinessSettingsApi settings, DocumentSequences sequences,
                       SaleRepository sales, SaleItemRepository saleItems, SalePaymentRepository salePayments,
                       SaleQueryService queries, AuditLogger audit, ApplicationEventPublisher events,
                       PlatformTransactionManager transactionManager) {
        this.cash = cash;
        this.ledger = ledger;
        this.pricing = pricing;
        this.catalog = catalog;
        this.customers = customers;
        this.settings = settings;
        this.sequences = sequences;
        this.sales = sales;
        this.saleItems = saleItems;
        this.salePayments = salePayments;
        this.queries = queries;
        this.audit = audit;
        this.events = events;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ------------------------------------------------------------------ venta

    /**
     * Registra una venta. La {@code Idempotency-Key} es obligatoria: repetir la petición con la misma clave devuelve
     * la venta ya creada (sin crear otra ni gastar otro consecutivo).
     */
    public SaleView create(Create command, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = requireKey(idempotencyKey);
        Optional<UUID> existing = findByKey(key, actor);
        if (existing.isPresent()) {
            return queries.sale(existing.get());
        }
        UUID id;
        try {
            id = tx.execute(status -> register(command, key, actor));
        } catch (RuntimeException ex) {
            // Dos peticiones simultáneas con la misma clave: el índice único deja pasar una; la otra devuelve esa.
            Optional<UUID> winner = findByKey(key, actor);
            if (winner.isPresent()) {
                return queries.sale(winner.get());
            }
            throw ex;
        }
        return queries.sale(id);
    }

    private UUID register(Create c, String key, UUID actor) {
        BusinessSettings cfg = settings.current();
        List<ItemLine> lines = requireItems(c.items());
        OpenSession session = cash.lockOpenSessionOf(actor)
                .orElseThrow(() -> new BusinessRuleException("Abre la caja antes de registrar ventas."));
        CustomerRef customer = customers.find(c.customerId() == null ? CustomerApi.FINAL_CONSUMER_ID : c.customerId())
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
        if (!customer.active()) {
            throw new BusinessRuleException("El cliente " + customer.name() + " está inactivo.");
        }

        // 1. Precios, impuestos y descuentos: siempre los del servidor.
        Set<UUID> productIds = new LinkedHashSet<>();
        lines.forEach(l -> productIds.add(l.productId()));
        Map<UUID, StockProduct> products = catalog.stockProducts(productIds);
        List<PricedLine> priced = new ArrayList<>();
        List<PriceChangedException.Change> changes = new ArrayList<>();
        BigDecimal maxDiscount = BigDecimal.ZERO;
        int lineNo = 0;
        for (ItemLine line : lines) {
            lineNo++;
            StockProduct product = products.get(line.productId());
            if (product == null) {
                throw new NotFoundException("Producto no encontrado.");
            }
            ResolvedPrice price = pricing.price(line.productId(), line.unitId(), customer.priceListId());
            BigDecimal quantity = line.quantity().setScale(4, RoundingMode.HALF_UP);
            if (quantity.signum() <= 0) {
                throw new BusinessRuleException("La cantidad de " + product.name() + " debe ser mayor que cero.");
            }
            BigDecimal baseQuantity = quantity.multiply(price.factor()).setScale(4, RoundingMode.HALF_UP);
            if (baseQuantity.signum() <= 0 || baseQuantity.compareTo(MAX_BASE_QUANTITY) > 0) {
                // Cero por redondeo (0,0001 × 0,0001) o más de lo que cabe en la columna: antes daba 500 (QA INV-8).
                throw new BusinessRuleException("La cantidad de " + product.name() + " no es válida.");
            }
            if (!product.baseUnitAllowsDecimals() && baseQuantity.stripTrailingZeros().scale() > 0) {
                throw new BusinessRuleException(product.name() + " se vende en unidades enteras de "
                        + product.baseUnitCode() + ".");
            }
            BigDecimal discount = line.discountPercent() == null
                    ? BigDecimal.ZERO.setScale(2)
                    : line.discountPercent().setScale(2, RoundingMode.HALF_UP);
            if (discount.signum() < 0 || discount.compareTo(HUNDRED) > 0) {
                throw new BusinessRuleException("El descuento debe estar entre 0 % y 100 %.");
            }
            maxDiscount = maxDiscount.max(discount);
            LineAmounts amounts = SaleCalculator.line(price.price(), quantity, discount, price.taxRate(),
                    cfg.pricesIncludeTax());
            if (line.expectedUnitPrice() != null && line.expectedUnitPrice().compareTo(price.price()) != 0) {
                changes.add(new PriceChangedException.Change(lineNo, price.sku(), price.name(),
                        line.expectedUnitPrice(), price.price()));
            }
            priced.add(new PricedLine(lineNo, line, product, price, quantity, baseQuantity, discount, amounts));
        }
        if (maxDiscount.compareTo(cfg.maxDiscountPercent()) > 0
                && !CurrentActor.permissions().contains(DISCOUNT_PERMISSION)) {
            throw new ForbiddenException("Necesitas el permiso de descuentos para dar más del "
                    + cfg.maxDiscountPercent().stripTrailingZeros().toPlainString() + " %.");
        }
        Totals totals = Totals.of(priced);
        if (!changes.isEmpty() || (c.expectedTotal() != null
                && c.expectedTotal().setScale(2, RoundingMode.HALF_UP).compareTo(totals.total()) != 0)) {
            throw new PriceChangedException(changes, c.expectedTotal(), totals.total());
        }

        // 2. Pagos: la suma cubre el total y el cambio solo sale del efectivo.
        List<PaymentLine> paymentLines = c.payments() == null ? List.of() : c.payments();
        if (paymentLines.size() > MAX_PAYMENTS) {
            throw new BusinessRuleException("Máximo " + MAX_PAYMENTS + " pagos por venta.");
        }
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        List<PaymentMethodRef> usedMethods = new ArrayList<>();
        List<PaymentInput> inputs = new ArrayList<>();
        for (PaymentLine p : paymentLines) {
            PaymentMethodRef method = p.paymentMethodId() == null ? null : methods.get(p.paymentMethodId());
            if (method == null || !method.active()) {
                throw new BusinessRuleException("Medio de pago no válido.");
            }
            if (method.requiresReference() && (p.reference() == null || p.reference().isBlank())) {
                throw new BusinessRuleException("El pago con " + method.name() + " requiere una referencia.");
            }
            usedMethods.add(method);
            inputs.add(new PaymentInput(method.affectsCash(), p.amount()));
        }
        Settlement settlement;
        try {
            settlement = SaleCalculator.settle(totals.total(), inputs);
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException(ex.getMessage());
        }

        // 3. Inventario (bloqueo de saldos en orden) y consecutivo (bloqueo de fila).
        Set<UUID> tracked = new LinkedHashSet<>();
        priced.stream().filter(l -> l.price().trackInventory()).forEach(l -> tracked.add(l.line().productId()));
        StockLedger.Session stock = tracked.isEmpty() ? null : ledger.open(Set.of(session.branchId()), tracked, Set.of());
        DocumentSequences.Next next = sequences.next(SEQUENCE);
        UUID saleId = Ids.newId();
        String label = "Venta " + next.prefix() + "-" + next.number();

        Sale sale = Sale.complete(new Sale.Data(saleId, next.prefix(), next.number(), session.branchId(),
                session.cashRegisterId(), session.id(), customer.id(), customer.documentType(),
                customer.documentNumber(), customer.verificationDigit(), customer.name(), customer.priceListId(),
                cfg.pricesIncludeTax(), totals.gross(), totals.discount(), totals.base(), totals.tax(), totals.total(),
                settlement.paidTotal(), settlement.change(), priced.size(), blankToNull(c.notes()), key, actor));
        em.persist(sale);

        Map<UUID, BigDecimal[]> byTax = new LinkedHashMap<>();
        Map<UUID, PricedLine> taxSample = new LinkedHashMap<>();
        for (PricedLine l : priced) {
            boolean isTracked = l.price().trackInventory();
            BigDecimal unitCost = isTracked ? stock.averageCost(l.line().productId()) : l.product().cost();
            em.persist(SaleItem.of(new SaleItem.Data(saleId, l.lineNo(), l.line().productId(), l.price().sku(),
                    l.price().name(), l.price().unitId(), l.price().unitCode(), l.quantity(), l.price().factor(),
                    l.baseQuantity(), l.price().price(), l.amounts().gross(), l.discount(), l.amounts().discount(),
                    l.price().taxId(), l.price().taxType().name(), l.price().taxRate(), l.amounts().taxableBase(),
                    l.amounts().tax(), l.amounts().total(), unitCost == null ? BigDecimal.ZERO : unitCost, isTracked)));
            BigDecimal[] acc = byTax.computeIfAbsent(l.price().taxId(), k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            acc[0] = acc[0].add(l.amounts().taxableBase());
            acc[1] = acc[1].add(l.amounts().tax());
            taxSample.putIfAbsent(l.price().taxId(), l);
        }
        byTax.forEach((taxId, acc) -> {
            PricedLine sample = taxSample.get(taxId);
            em.persist(SaleTaxTotal.of(saleId, taxId, sample.price().taxType().name(), sample.price().taxRate(),
                    acc[0], acc[1]));
        });
        for (int i = 0; i < paymentLines.size(); i++) {
            PaymentLine p = paymentLines.get(i);
            PaymentMethodRef method = usedMethods.get(i);
            em.persist(SalePayment.of(saleId, i + 1, method.id(), method.code(), method.affectsCash(),
                    settlement.applied().get(i), SaleCalculator.money(p.amount()), blankToNull(p.reference())));
        }

        if (stock != null) {
            for (PricedLine l : priced) {
                if (l.price().trackInventory()) {
                    stock.post(session.branchId(), l.line().productId(), MovementType.SALE, l.baseQuantity().negate(),
                            null, cfg.allowNegativeStock(), REFERENCE_TYPE, saleId, label);
                }
            }
        }
        if (settlement.cashNet().signum() > 0) {
            cash.recordSaleCash(session.id(), settlement.cashNet(), saleId, label);
        }

        Map<String, Object> after = new LinkedHashMap<>();
        after.put("number", sale.documentNumber());
        after.put("total", sale.getTotal());
        after.put("items", priced.size());
        after.put("customerId", customer.id());
        after.put("cashSessionId", session.id());
        audit.log("SALE_CREATED", "sale", saleId, null, after);
        events.publishEvent(new SaleCompleted(CurrentTenant.require().id(), saleId, next.prefix(), next.number(),
                customer.id(), sale.getTotal(), Instant.now()));
        return saleId;
    }

    // ------------------------------------------------------------------ anulación

    /**
     * Anula una venta: no borra nada. Marca VOIDED, devuelve el inventario (SALE_VOID) y el efectivo. Si la sesión
     * de caja de la venta ya se cerró, el efectivo se devuelve desde la caja abierta de quien anula.
     */
    public SaleView voidSale(UUID saleId, String reason) {
        UUID actor = CurrentActor.requireUserId();
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException("El motivo de la anulación es obligatorio.");
        }
        String why = reason.trim();
        UUID id = tx.execute(status -> annul(saleId, why, actor));
        return queries.sale(id);
    }

    private UUID annul(UUID saleId, String reason, UUID actor) {
        Sale sale = sales.lockById(saleId).orElseThrow(() -> new NotFoundException("Venta no encontrada."));
        if (sale.isVoided()) {
            throw new ConflictException("La venta " + sale.documentNumber() + " ya está anulada.");
        }
        BigDecimal cashNet = salePayments.findBySaleIdOrderByLineNoAsc(saleId).stream()
                .filter(SalePayment::isAffectsCash)
                .map(SalePayment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        UUID refundSession = null;
        if (cashNet.signum() > 0) {
            refundSession = cash.lockIfOpen(sale.getCashSessionId())
                    .or(() -> cash.lockOpenSessionOf(actor))
                    .map(OpenSession::id)
                    .orElseThrow(() -> new BusinessRuleException("La caja de esta venta ya se cerró. Abre tu caja "
                            + "para devolver el efectivo y vuelve a anular."));
        }
        String label = "Anulación " + sale.documentNumber() + ": " + reason;
        if (label.length() > 255) {
            label = label.substring(0, 255);
        }
        List<SaleItem> items = saleItems.findBySaleIdOrderByLineNoAsc(saleId);
        Set<UUID> tracked = new LinkedHashSet<>();
        items.stream().filter(SaleItem::isTrackInventory).forEach(i -> tracked.add(i.getProductId()));
        if (!tracked.isEmpty()) {
            StockLedger.Session stock = ledger.open(Set.of(sale.getBranchId()), tracked, Set.of(), true);
            for (SaleItem item : items) {
                if (item.isTrackInventory()) {
                    stock.post(sale.getBranchId(), item.getProductId(), MovementType.SALE_VOID, item.getBaseQuantity(),
                            null, true, REFERENCE_TYPE, saleId, label);
                }
            }
        }
        if (refundSession != null) {
            cash.recordVoidCash(refundSession, cashNet, saleId, label);
        }
        sale.voidSale(actor, reason, refundSession);

        Map<String, Object> after = new LinkedHashMap<>();
        after.put("number", sale.documentNumber());
        after.put("reason", reason);
        after.put("refundCashSessionId", refundSession);
        audit.log("SALE_VOIDED", "sale", saleId, null, after);
        events.publishEvent(new SaleVoided(CurrentTenant.require().id(), saleId, sale.getPrefix(), sale.getNumber(),
                reason, Instant.now()));
        return saleId;
    }

    // ------------------------------------------------------------------ apoyo

    private record PricedLine(int lineNo, ItemLine line, StockProduct product, ResolvedPrice price,
                              BigDecimal quantity, BigDecimal baseQuantity, BigDecimal discount,
                              LineAmounts amounts) {
    }

    private record Totals(BigDecimal gross, BigDecimal discount, BigDecimal base, BigDecimal tax, BigDecimal total) {

        static Totals of(List<PricedLine> lines) {
            BigDecimal gross = BigDecimal.ZERO.setScale(2);
            BigDecimal discount = gross;
            BigDecimal base = gross;
            BigDecimal tax = gross;
            BigDecimal total = gross;
            for (PricedLine l : lines) {
                gross = gross.add(l.amounts().gross());
                discount = discount.add(l.amounts().discount());
                base = base.add(l.amounts().taxableBase());
                tax = tax.add(l.amounts().tax());
                total = total.add(l.amounts().total());
            }
            return new Totals(gross, discount, base, tax, total);
        }
    }

    private Optional<UUID> findByKey(String key, UUID actor) {
        Supplier<Optional<UUID>> lookup = () -> sales.findByIdempotencyKey(key).map(s -> {
            if (!s.getCreatedBy().equals(actor)) {
                throw new ConflictException("Esta Idempotency-Key ya se usó en otra venta.");
            }
            return s.getId();
        });
        Optional<UUID> result = tx.execute(status -> lookup.get());
        return result == null ? Optional.empty() : result;
    }

    private static List<ItemLine> requireItems(List<ItemLine> items) {
        if (items == null || items.isEmpty()) {
            throw new BusinessRuleException("La venta debe tener al menos un producto.");
        }
        if (items.size() > MAX_ITEMS) {
            throw new BusinessRuleException("Máximo " + MAX_ITEMS + " líneas por venta.");
        }
        for (ItemLine line : items) {
            if (line == null || line.productId() == null || line.quantity() == null) {
                throw new BusinessRuleException("Cada línea necesita producto y cantidad.");
            }
        }
        return items;
    }

    private static String requireKey(String key) {
        if (key == null || key.isBlank()) {
            throw new BusinessRuleException("Falta el encabezado Idempotency-Key.");
        }
        String trimmed = key.trim();
        if (!IDEMPOTENCY_KEY.matcher(trimmed).matches()) {
            throw new BusinessRuleException("Idempotency-Key inválida: usa de 8 a 100 letras, números, '-' o '_'.");
        }
        return trimmed;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
