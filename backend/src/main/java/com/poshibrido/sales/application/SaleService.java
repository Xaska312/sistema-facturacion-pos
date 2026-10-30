package com.poshibrido.sales.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.credit.application.CreditApi;
import com.poshibrido.orders.application.OrderApi;
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
import com.poshibrido.catalog.application.ModifierApi;
import com.poshibrido.sales.application.SaleCommands.ItemLine;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.sales.application.SaleViews.SaleView;
import com.poshibrido.sales.domain.Sale;
import com.poshibrido.sales.domain.SaleCalculator;
import com.poshibrido.sales.domain.SaleCalculator.LineAmounts;
import com.poshibrido.sales.domain.SaleCalculator.PaymentInput;
import com.poshibrido.sales.domain.SaleCalculator.Settlement;
import com.poshibrido.sales.domain.SaleItem;
import com.poshibrido.sales.domain.SaleItemModifier;
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
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.application.CurrentTenant;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
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
    /** Vender productos de precio libre escribiendo el precio (decisión 253). */
    static final String OPEN_PRICE_PERMISSION = "sales:open-price";
    static final int MAX_ITEMS = 200;
    /** Medio de pago "Anticipo" de los pedidos (decisión 258). */
    static final String DEPOSIT_METHOD = "DEPOSIT";
    static final int MAX_PAYMENTS = 10;
    /** Nota por línea ("sin cebolla"), Fase 12b-1. */
    static final int MAX_NOTE = 140;
    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final CashApi cash;
    private final CreditApi credit;
    private final OrderApi orders;
    private final StockLedger ledger;
    private final PricingApi pricing;
    private final InventoryCatalogApi catalog;
    private final ModifierApi modifiers;
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

    public SaleService(CashApi cash, CreditApi credit, OrderApi orders, StockLedger ledger, PricingApi pricing,
                       InventoryCatalogApi catalog, ModifierApi modifiers, CustomerApi customers,
                       BusinessSettingsApi settings, DocumentSequences sequences,
                       SaleRepository sales, SaleItemRepository saleItems, SalePaymentRepository salePayments,
                       SaleQueryService queries, AuditLogger audit, ApplicationEventPublisher events,
                       PlatformTransactionManager transactionManager) {
        this.cash = cash;
        this.credit = credit;
        this.orders = orders;
        this.ledger = ledger;
        this.pricing = pricing;
        this.catalog = catalog;
        this.modifiers = modifiers;
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
            id = tx.execute(status -> register(command, key, actor, Options.POS));
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

    /**
     * Venta de la entrega de un pedido por encargo (decisión 258): las líneas llevan el precio acordado en el pedido
     * (no el de la lista) y su descripción, y {@code depositApplied} se paga con "Anticipo" (exactamente ese valor: el
     * pedido lo descuenta de lo anticipado). Corre dentro de la transacción del pedido (que ya lo tiene bloqueado). La
     * {@code Idempotency-Key} es obligatoria.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID createForOrder(Create command, List<String> names, BigDecimal depositApplied, String idempotencyKey) {
        return register(command, requireKey(idempotencyKey), CurrentActor.requireUserId(),
                new Options(true, true, names, depositApplied == null ? BigDecimal.ZERO : depositApplied));
    }

    /**
     * Venta de una cotización aceptada (decisión 260): las líneas llevan el precio y el descuento cotizados (no los de
     * la lista) y su descripción; {@code expectedTotal} es el total de la cotización (si los impuestos cambiaron, 409).
     * Corre dentro de la transacción de la cotización (que ya la tiene bloqueada).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID createForQuote(Create command, List<String> names, String idempotencyKey) {
        return register(command, requireKey(idempotencyKey), CurrentActor.requireUserId(),
                new Options(true, false, names, BigDecimal.ZERO));
    }

    /**
     * Venta del cobro de una cuenta de mesa (Fase 12b-2, decisión 269): igual que en el POS (precio vigente con la
     * lista del cliente, adiciones y nota; en precio libre, el que se escribió), dentro de la transacción de la cuenta
     * (que ya la tiene bloqueada). {@code notes} lleva el nombre de la cuenta ("Mesa 4"). La {@code Idempotency-Key}
     * es obligatoria.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID createForTab(Create command, String idempotencyKey) {
        return register(command, requireKey(idempotencyKey), CurrentActor.requireUserId(), Options.TAB);
    }

    /** Venta ya registrada con esa clave por el usuario actual (para reintentos de la entrega de un pedido). */
    public Optional<UUID> existingSale(String idempotencyKey) {
        return findByKey(requireKey(idempotencyKey), CurrentActor.requireUserId());
    }

    /**
     * {@code agreedPrices}: el precio de cada línea es el acordado (pedido o cotización), no el de la lista;
     * {@code fromOrder}: entrega de un pedido (permite "Anticipo"); {@code names}: nombre de cada línea (o nulo = el
     * del producto); {@code depositApplied}: lo que se paga con "Anticipo" (solo en la entrega de un pedido).
     */
    private record Options(boolean agreedPrices, boolean fromOrder, List<String> names, BigDecimal depositApplied,
                           boolean allowTip) {
        static final Options POS = new Options(false, false, null, BigDecimal.ZERO, false);
        /** Cobro de una cuenta de mesa: como el POS, y admite propina (Fase 12b-5). */
        static final Options TAB = new Options(false, false, null, BigDecimal.ZERO, true);

        Options(boolean agreedPrices, boolean fromOrder, List<String> names, BigDecimal depositApplied) {
            this(agreedPrices, fromOrder, names, depositApplied, false);
        }
    }

    private UUID register(Create c, String key, UUID actor, Options options) {
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
        // Adiciones (Fase 12b-1): solo en el POS (no en pedidos ni cotizaciones) y con el módulo encendido.
        boolean modifiersOn = !options.agreedPrices()
                && CurrentActor.permissions().contains(BusinessModule.MODIFIERS.authority());
        if (!modifiersOn && lines.stream().anyMatch(l -> l.modifiers() != null && !l.modifiers().isEmpty())) {
            throw new BusinessRuleException("Las adiciones están apagadas en este negocio. El dueño las prende en "
                    + "Ajustes → Tipo y módulos.");
        }
        Map<UUID, List<ModifierApi.Group>> groups = modifiersOn ? modifiers.activeGroupsFor(productIds) : Map.of();
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
            if (options.agreedPrices()) {
                // Pedido por encargo o cotización: manda el precio acordado.
                BigDecimal agreed = line.expectedUnitPrice();
                if (agreed == null || agreed.signum() <= 0) {
                    throw new BusinessRuleException("Falta el precio de " + price.name() + ".");
                }
                price = price.withTypedPrice(agreed.setScale(2, RoundingMode.HALF_UP));
            } else if (price.openPrice()) {
                // Precio libre (decisión 253): manda el precio que escribió el cajero (queda en la línea de la venta).
                if (!CurrentActor.permissions().contains(OPEN_PRICE_PERMISSION)) {
                    throw new ForbiddenException("Tu usuario no puede vender productos de precio libre ("
                            + price.name() + "). Pídele el permiso al dueño del negocio.");
                }
                BigDecimal typed = line.expectedUnitPrice();
                if (typed == null || typed.signum() <= 0) {
                    throw new BusinessRuleException("Escribe el precio de " + price.name() + ".");
                }
                price = price.withTypedPrice(typed.setScale(2, RoundingMode.HALF_UP));
            }
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
            ModifierChoices.Result chosen = modifiersOn
                    ? ModifierChoices.resolve(product.name(), groups.get(line.productId()), line.modifiers(), true)
                    : ModifierChoices.Result.NONE;
            // El precio de la línea incluye las adiciones; nunca baja de cero ("Sin licor" en un producto barato).
            BigDecimal unitPrice = price.price().add(chosen.perUnit()).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
            String note = blankToNull(line.note());
            if (note != null && note.length() > MAX_NOTE) {
                throw new BusinessRuleException("La nota de " + product.name() + " admite hasta " + MAX_NOTE
                        + " caracteres.");
            }
            LineAmounts amounts = SaleCalculator.line(unitPrice, quantity, discount, price.taxRate(),
                    cfg.pricesIncludeTax());
            if (!options.agreedPrices() && !price.openPrice() && line.expectedUnitPrice() != null
                    && line.expectedUnitPrice().compareTo(price.price()) != 0) {
                changes.add(new PriceChangedException.Change(lineNo, price.sku(), price.name(),
                        line.expectedUnitPrice(), price.price()));
            }
            priced.add(new PricedLine(lineNo, line, product, price, quantity, baseQuantity, discount, amounts, unitPrice,
                    chosen, note));
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
        int creditIndex = -1;
        boolean depositSeen = false;
        for (PaymentLine p : paymentLines) {
            PaymentMethodRef method = p.paymentMethodId() == null ? null : methods.get(p.paymentMethodId());
            if (method == null || !method.active()) {
                throw new BusinessRuleException("Medio de pago no válido.");
            }
            if (CreditApi.METHOD_CODE.equals(method.code())) {
                // Con el módulo de fiados apagado (decisión 267) no se fía; las cuentas que ya hay se conservan.
                if (!CurrentActor.permissions().contains(BusinessModule.CREDIT.authority())) {
                    throw new BusinessRuleException("El fiado está apagado en este negocio. El dueño lo prende en "
                            + "Ajustes → Tipo y módulos.");
                }
                // Fiado (decisión 255): una sola línea; la cuenta del cliente se carga al final.
                if (creditIndex >= 0) {
                    throw new BusinessRuleException("Usa un solo pago fiado por venta.");
                }
                creditIndex = usedMethods.size();
            }
            if (DEPOSIT_METHOD.equals(method.code())) {
                // Solo la entrega de un pedido, y solo por lo que el pedido aplica de su anticipo (una línea).
                if (!options.fromOrder()) {
                    throw new BusinessRuleException("El anticipo solo se usa al entregar un pedido.");
                }
                if (depositSeen || p.amount() == null || p.amount().compareTo(options.depositApplied()) != 0) {
                    throw new BusinessRuleException("El anticipo se aplica solo.");
                }
                depositSeen = true;
            }
            if (method.requiresReference() && (p.reference() == null || p.reference().isBlank())) {
                throw new BusinessRuleException("El pago con " + method.name() + " requiere una referencia.");
            }
            usedMethods.add(method);
            inputs.add(new PaymentInput(method.affectsCash(), p.amount()));
        }
        if (options.depositApplied().signum() > 0 && !depositSeen) {
            throw new BusinessRuleException("Falta aplicar el anticipo del pedido.");
        }
        // Propina (Fase 12b-5): los pagos cubren el total más la propina; luego se saca del pago de su medio.
        BigDecimal tipAmount = BigDecimal.ZERO;
        PaymentMethodRef tipMethod = null;
        if (c.tip() != null && c.tip().amount() != null && c.tip().amount().signum() > 0) {
            if (!options.allowTip()) {
                throw new BusinessRuleException("La propina solo se registra al cobrar una cuenta de mesa.");
            }
            tipAmount = SaleCalculator.money(c.tip().amount());
            if (tipAmount.compareTo(totals.total()) > 0) {
                throw new BusinessRuleException("La propina no puede ser mayor que la cuenta.");
            }
            tipMethod = c.tip().paymentMethodId() == null ? null : methods.get(c.tip().paymentMethodId());
            if (tipMethod == null || !tipMethod.active() || CreditApi.METHOD_CODE.equals(tipMethod.code())
                    || DEPOSIT_METHOD.equals(tipMethod.code())) {
                throw new BusinessRuleException("Elige con qué se paga la propina (efectivo, tarjeta o transferencia).");
            }
        }
        Settlement settlement;
        try {
            settlement = SaleCalculator.settle(totals.total().add(tipAmount), inputs);
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException(ex.getMessage());
        }
        List<BigDecimal> applied = settlement.applied();
        BigDecimal saleCash = settlement.cashNet();
        if (tipMethod != null) {
            UUID tipMethodId = tipMethod.id();
            applied = SaleCalculator.carveTip(applied, usedMethods.stream().map(m -> m.id().equals(tipMethodId)).toList(),
                    tipAmount).orElseThrow(() -> new BusinessRuleException("La propina se paga con uno de los medios de "
                    + "pago de la cuenta y no puede superar lo pagado con ese medio."));
            if (tipMethod.affectsCash()) {
                saleCash = saleCash.subtract(tipAmount);
            }
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
            SaleItem item = SaleItem.of(new SaleItem.Data(saleId, l.lineNo(), l.line().productId(), l.price().sku(),
                    itemName(options, l), l.price().unitId(), l.price().unitCode(), l.quantity(), l.price().factor(),
                    l.baseQuantity(), l.unitPrice(), l.amounts().gross(), l.discount(), l.amounts().discount(),
                    l.price().taxId(), l.price().taxType().name(), l.price().taxRate(), l.amounts().taxableBase(),
                    l.amounts().tax(), l.amounts().total(), unitCost == null ? BigDecimal.ZERO : unitCost, isTracked,
                    l.note()));
            em.persist(item);
            for (ModifierChoices.Chosen m : l.modifiers().chosen()) {
                em.persist(SaleItemModifier.of(item.getId(), m.position(), m.groupName(), m.optionId(), m.optionName(),
                        m.quantity(), m.unitPrice()));
            }
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
                    applied.get(i), SaleCalculator.money(p.amount()), blankToNull(p.reference())));
        }

        if (stock != null) {
            for (PricedLine l : priced) {
                if (l.price().trackInventory()) {
                    stock.post(session.branchId(), l.line().productId(), MovementType.SALE, l.baseQuantity().negate(),
                            null, cfg.allowNegativeStock(), REFERENCE_TYPE, saleId, label);
                }
            }
        }
        if (saleCash.signum() > 0) {
            cash.recordSaleCash(session.id(), saleCash, saleId, label);
        }
        if (tipMethod != null) {
            em.createNativeQuery("""
                    INSERT INTO sale_tips (sale_id, branch_id, cash_session_id, amount, payment_method_id, method_code,
                                           affects_cash, suggested_percent, created_by, created_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)""")
                    .setParameter(1, saleId).setParameter(2, session.branchId()).setParameter(3, session.id())
                    .setParameter(4, tipAmount).setParameter(5, tipMethod.id()).setParameter(6, tipMethod.code())
                    .setParameter(7, tipMethod.affectsCash()).setParameter(8, c.tip().suggestedPercent())
                    .setParameter(9, actor).setParameter(10, Instant.now()).executeUpdate();
            if (tipMethod.affectsCash()) {
                cash.recordTipCash(session.id(), tipAmount, saleId, "Propina " + label.substring("Venta ".length()));
            }
        }
        if (creditIndex >= 0) {
            // Último bloqueo de la venta: la cuenta de fiado del cliente (valida el cupo).
            credit.chargeSale(new CreditApi.Debtor(customer.id(), customer.name(), customer.creditLimit()),
                    applied.get(creditIndex), saleId, session.id(), usedMethods.get(creditIndex).id());
        }

        Map<String, Object> after = new LinkedHashMap<>();
        after.put("number", sale.documentNumber());
        after.put("total", sale.getTotal());
        after.put("items", priced.size());
        after.put("customerId", customer.id());
        after.put("cashSessionId", session.id());
        if (tipMethod != null) {
            after.put("tip", tipAmount);
            after.put("tipMethod", tipMethod.code());
        }
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
        // Propina en efectivo (Fase 12b-5): también se devuelve.
        @SuppressWarnings("unchecked")
        List<Object[]> tipRows = em.createNativeQuery("""
                SELECT amount, affects_cash FROM sale_tips WHERE sale_id = ?1 AND voided_at IS NULL FOR UPDATE""")
                .setParameter(1, saleId).getResultList();
        BigDecimal tipCash = tipRows.isEmpty() || !Boolean.TRUE.equals(tipRows.getFirst()[1]) ? BigDecimal.ZERO
                : (BigDecimal) tipRows.getFirst()[0];
        UUID refundSession = null;
        if (cashNet.signum() > 0 || tipCash.signum() > 0) {
            refundSession = cash.lockIfOpen(sale.getCashSessionId())
                    .or(() -> cash.lockOpenSessionOf(actor))
                    .map(OpenSession::id)
                    .orElseThrow(() -> new BusinessRuleException("La caja de esta venta ya se cerró. Abre tu caja "
                            + "para devolver el efectivo y vuelve a anular."));
        }
        // Si fue la entrega de un pedido, sus líneas vuelven a quedar pendientes (antes del inventario: orden de bloqueos).
        orders.saleVoided(saleId);
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
        if (refundSession != null && cashNet.signum() > 0) {
            cash.recordVoidCash(refundSession, cashNet, saleId, label);
        }
        if (!tipRows.isEmpty()) {
            em.createNativeQuery("UPDATE sale_tips SET voided_at = ?2, voided_by = ?3 WHERE sale_id = ?1")
                    .setParameter(1, saleId).setParameter(2, Instant.now()).setParameter(3, actor).executeUpdate();
            if (tipCash.signum() > 0) {
                cash.recordTipVoidCash(refundSession, tipCash, saleId, "Propina devuelta " + sale.documentNumber());
            }
        }
        // Lo fiado de la venta se le descuenta al cliente (decisión 255).
        credit.reverseSale(saleId);
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

    private static String itemName(Options options, PricedLine l) {
        String custom = options.names() == null || options.names().size() < l.lineNo() ? null
                : options.names().get(l.lineNo() - 1);
        String name = custom == null || custom.isBlank() ? l.price().name() : custom.trim();
        return name.length() > 200 ? name.substring(0, 200) : name;
    }

    /** {@code unitPrice}: precio del producto más sus adiciones (lo que se cobra por unidad). */
    private record PricedLine(int lineNo, ItemLine line, StockProduct product, ResolvedPrice price,
                              BigDecimal quantity, BigDecimal baseQuantity, BigDecimal discount,
                              LineAmounts amounts, BigDecimal unitPrice, ModifierChoices.Result modifiers,
                              String note) {
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
