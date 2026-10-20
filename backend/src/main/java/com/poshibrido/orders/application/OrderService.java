package com.poshibrido.orders.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.orders.application.OrderViews.DeliveryResult;
import com.poshibrido.orders.application.OrderViews.OrderView;
import com.poshibrido.orders.domain.CustomerOrder;
import com.poshibrido.orders.domain.OrderItem;
import com.poshibrido.orders.domain.OrderPayment;
import com.poshibrido.orders.domain.OrderPaymentType;
import com.poshibrido.orders.domain.OrderStatus;
import com.poshibrido.orders.infrastructure.OrderItemRepository;
import com.poshibrido.orders.infrastructure.OrderPaymentRepository;
import com.poshibrido.orders.infrastructure.OrderRepository;
import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.parties.application.CustomerApi.CustomerRef;
import com.poshibrido.sales.application.SaleCommands;
import com.poshibrido.sales.application.SaleCommands.ItemLine;
import com.poshibrido.sales.application.SaleCommands.PaymentLine;
import com.poshibrido.sales.application.SaleService;
import com.poshibrido.sales.domain.SaleCalculator;
import com.poshibrido.sales.infrastructure.DocumentSequences;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Pedidos por encargo (decisión 258): crear, editar lo pendiente, recibir anticipos, entregar (todo o parte, como una
 * venta) y cancelar devolviendo lo anticipado. Orden de bloqueos: pedido → caja (compartido) → inventario →
 * consecutivo → cuenta de fiado. Anular una venta toma venta → caja → pedido: no hay espera circular porque la caja
 * se toma compartida en los dos caminos y el cierre de caja nunca bloquea pedidos.
 */
@Service
public class OrderService {

    static final String SEQUENCE = "ORDER";
    static final String MANAGE_PERMISSION = "orders:manage";
    static final String DEPOSIT_METHOD = "DEPOSIT";
    static final String CREDIT_METHOD = "CREDIT";
    static final int MAX_ITEMS = 100;
    /** Medida máxima de un lado, en metros. */
    private static final BigDecimal MAX_SIDE = new BigDecimal("100");
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final OrderRepository orders;
    private final OrderItemRepository items;
    private final OrderPaymentRepository payments;
    private final OrderQueryService queries;
    private final CustomerApi customers;
    private final PricingApi pricing;
    private final InventoryCatalogApi catalog;
    private final BusinessSettingsApi settings;
    private final DocumentSequences sequences;
    private final CashApi cash;
    private final SaleService sales;
    private final AuditLogger audit;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    public OrderService(OrderRepository orders, OrderItemRepository items, OrderPaymentRepository payments,
                        OrderQueryService queries, CustomerApi customers, PricingApi pricing,
                        InventoryCatalogApi catalog, BusinessSettingsApi settings, DocumentSequences sequences,
                        CashApi cash, SaleService sales, AuditLogger audit,
                        PlatformTransactionManager transactionManager) {
        this.orders = orders;
        this.items = items;
        this.payments = payments;
        this.queries = queries;
        this.customers = customers;
        this.pricing = pricing;
        this.catalog = catalog;
        this.settings = settings;
        this.sequences = sequences;
        this.cash = cash;
        this.sales = sales;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** {@code width}/{@code length} en metros (los dos o ninguno): la cantidad es el área en m². */
    public record ItemInput(UUID productId, String description, BigDecimal width, BigDecimal length,
                            BigDecimal quantity, BigDecimal unitPrice) {
    }

    /** En una edición, {@code items} son las líneas pendientes (las entregadas no cambian) y el cliente no cambia. */
    public record OrderInput(UUID customerId, LocalDate dueDate, String address, String notes,
                             List<ItemInput> items) {
    }

    public record PaymentInput(BigDecimal amount, UUID paymentMethodId, String reference, String notes) {
    }

    /** {@code payments}: cómo se paga lo que el anticipo no cubre (como en el POS: efectivo con cambio, fiado…). */
    public record DeliverInput(List<UUID> itemIds, List<PaymentLine> payments) {
    }

    public record CancelInput(String reason, UUID refundMethodId, String reference) {
    }

    // ------------------------------------------------------------------ crear y editar

    public OrderView create(OrderInput in) {
        UUID actor = CurrentActor.requireUserId();
        UUID id = tx.execute(status -> {
            CustomerRef customer = requireCustomer(in.customerId());
            LocalDate due = requireDueDate(in.dueDate());
            List<OrderItem.Data> lines = price(in.items(), customer);
            BigDecimal total = sum(lines);
            DocumentSequences.Next next = sequences.next(SEQUENCE);
            CustomerOrder order = CustomerOrder.create(next.prefix(), next.number(), customer.id(), due,
                    clean(in.address(), 255), clean(in.notes(), 1000), total, actor);
            em.persist(order);
            int lineNo = 0;
            for (OrderItem.Data line : lines) {
                em.persist(OrderItem.of(order.getId(), ++lineNo, line));
            }
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("number", order.documentNumber());
            after.put("customerId", customer.id());
            after.put("total", total);
            after.put("dueDate", due.toString());
            audit.log("ORDER_CREATED", "order", order.getId(), null, after);
            return order.getId();
        });
        return tx.execute(status -> queries.view(id));
    }

    public OrderView update(UUID orderId, OrderInput in) {
        UUID actor = CurrentActor.requireUserId();
        tx.executeWithoutResult(status -> {
            CustomerOrder order = lockOpen(orderId);
            if (in.customerId() != null && !in.customerId().equals(order.getCustomerId())) {
                throw new BusinessRuleException("El cliente de un pedido no cambia. Cancélalo y crea otro.");
            }
            CustomerRef customer = customers.find(order.getCustomerId())
                    .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
            // Un pedido atrasado se puede editar sin moverle la fecha; una fecha nueva no puede ser pasada.
            LocalDate due = in.dueDate() != null && in.dueDate().equals(order.getDueDate())
                    ? order.getDueDate() : requireDueDate(in.dueDate());
            List<OrderItem> current = items.findByOrderIdOrderByLineNoAsc(orderId);
            List<OrderItem> delivered = current.stream().filter(OrderItem::isDelivered).toList();
            List<OrderItem.Data> pending = in.items() == null || in.items().isEmpty()
                    ? List.of()
                    : price(in.items(), customer);
            if (delivered.isEmpty() && pending.isEmpty()) {
                throw new BusinessRuleException("El pedido debe tener al menos un producto.");
            }
            BigDecimal newPending = sum(pending);
            BigDecimal available = payments.available(orderId);
            if (available.compareTo(newPending) > 0) {
                throw new BusinessRuleException("Lo anticipado ($ " + pesos(available)
                        + ") es más que lo pendiente ($ " + pesos(newPending) + "). Deja más productos o cancela el "
                        + "pedido para devolver el anticipo.");
            }
            BigDecimal before = order.getTotal();
            current.stream().filter(i -> !i.isDelivered()).forEach(em::remove);
            em.flush();
            int lineNo = delivered.stream().mapToInt(OrderItem::getLineNo).max().orElse(0);
            for (OrderItem.Data line : pending) {
                em.persist(OrderItem.of(orderId, ++lineNo, line));
            }
            BigDecimal deliveredTotal = delivered.stream().map(OrderItem::getTotal)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            order.update(due, clean(in.address(), 255), clean(in.notes(), 1000), deliveredTotal.add(newPending),
                    actor);
            if (pending.isEmpty()) {
                // Solo quedaron líneas entregadas: el pedido queda completo.
                order.markDelivered(actor);
            }
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("totalBefore", before);
            after.put("total", order.getTotal());
            after.put("dueDate", due.toString());
            audit.log("ORDER_UPDATED", "order", orderId, null, after);
        });
        return tx.execute(status -> queries.view(orderId));
    }

    // ------------------------------------------------------------------ anticipos

    /**
     * Anticipo o abono. En efectivo entra a la caja abierta de quien lo recibe; sin caja abierta solo lo registra quien
     * tiene orders:manage (así todo anticipo de un cajero queda en un cierre). No puede pasar de lo que falta por
     * pagar. La {@code Idempotency-Key} es obligatoria: repetirla devuelve el mismo pedido sin cobrar otra vez.
     */
    public OrderView pay(UUID orderId, PaymentInput in, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = requireKey(idempotencyKey);
        if (replayPayment(key, orderId, actor)) {
            return tx.execute(status -> queries.view(orderId));
        }
        try {
            tx.executeWithoutResult(status -> deposit(orderId, in, key, actor));
        } catch (RuntimeException ex) {
            if (!replayPayment(key, orderId, actor)) {
                throw ex;
            }
        }
        return tx.execute(status -> queries.view(orderId));
    }

    private void deposit(UUID orderId, PaymentInput in, String key, UUID actor) {
        CustomerOrder order = lockOpen(orderId);
        BigDecimal amount = in.amount() == null ? null : in.amount().setScale(2, RoundingMode.HALF_UP);
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("El anticipo debe ser mayor que cero.");
        }
        PaymentMethodRef method = moneyMethod(in.paymentMethodId());
        String reference = clean(in.reference(), 60);
        if (method.requiresReference() && reference == null) {
            throw new BusinessRuleException("El pago con " + method.name() + " requiere una referencia.");
        }
        Optional<OpenSession> session = cash.lockOpenSessionOf(actor);
        requireSessionFor(method, session, "recibir anticipos");
        BigDecimal due = pendingTotal(orderId).subtract(payments.available(orderId));
        if (amount.compareTo(due) > 0) {
            throw new BusinessRuleException(due.signum() <= 0
                    ? "El pedido " + order.documentNumber() + " ya está pago."
                    : "El anticipo no puede ser mayor que lo que falta por pagar: $ " + pesos(due) + ".");
        }
        UUID sessionId = session.map(OpenSession::id).orElse(null);
        OrderPayment payment = OrderPayment.record(new OrderPayment.Data(orderId, OrderPaymentType.DEPOSIT, amount,
                method.id(), method.code(), reference, clean(in.notes(), 255), sessionId, null, key, actor));
        em.persist(payment);
        if (method.affectsCash()) {
            cash.recordOrderPaymentCash(sessionId, amount, payment.getId(), "Anticipo " + order.documentNumber());
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("amount", amount);
        after.put("method", method.code());
        after.put("cashSessionId", sessionId);
        audit.log("ORDER_PAYMENT_RECEIVED", "order", orderId, null, after);
    }

    private boolean replayPayment(String key, UUID orderId, UUID actor) {
        Boolean found = tx.execute(status -> payments.findByIdempotencyKey(key).map(p -> {
            if (!p.getOrderId().equals(orderId) || !actor.equals(p.getCreatedBy())) {
                throw new ConflictException("Esta Idempotency-Key ya se usó en otro anticipo.");
            }
            return true;
        }).orElse(false));
        return Boolean.TRUE.equals(found);
    }

    // ------------------------------------------------------------------ entregar

    /**
     * Entrega de las líneas elegidas: se registra como una venta normal (en la caja abierta de quien entrega, con el
     * precio acordado y la descripción de cada línea). Lo anticipado se aplica primero ("Anticipo"); el resto se paga
     * con {@code payments}. La {@code Idempotency-Key} es la de la venta: repetirla devuelve la misma entrega.
     */
    public DeliveryResult deliver(UUID orderId, DeliverInput in, String idempotencyKey) {
        String key = requireKey(idempotencyKey);
        Optional<UUID> existing = sales.existingSale(key);
        if (existing.isPresent()) {
            return new DeliveryResult(tx.execute(status -> queries.view(orderId)), belongsTo(existing.get(), orderId));
        }
        UUID saleId;
        try {
            saleId = tx.execute(status -> handOver(orderId, in, key));
        } catch (RuntimeException ex) {
            Optional<UUID> winner = sales.existingSale(key);
            if (winner.isEmpty()) {
                throw ex;
            }
            saleId = belongsTo(winner.get(), orderId);
        }
        UUID id = saleId;
        return new DeliveryResult(tx.execute(status -> queries.view(orderId)), id);
    }

    /** Un reintento con la clave de una venta que no es una entrega de este pedido es un error del cliente. */
    private UUID belongsTo(UUID saleId, UUID orderId) {
        // Las líneas pierden la venta si se anuló; lo aplicado del anticipo la conserva.
        Boolean ok = tx.execute(status -> items.orderIdsBySale(saleId).contains(orderId)
                || payments.findBySaleIdAndType(saleId, OrderPaymentType.APPLIED)
                        .map(p -> p.getOrderId().equals(orderId)).orElse(false));
        if (!Boolean.TRUE.equals(ok)) {
            throw new ConflictException("Esta Idempotency-Key ya se usó en otra venta.");
        }
        return saleId;
    }

    private UUID handOver(UUID orderId, DeliverInput in, String key) {
        UUID actor = CurrentActor.requireUserId();
        CustomerOrder order = lockOpen(orderId);
        if (in.itemIds() == null || in.itemIds().isEmpty()) {
            throw new BusinessRuleException("Elige qué vas a entregar.");
        }
        Set<UUID> wanted = new LinkedHashSet<>(in.itemIds());
        List<OrderItem> all = items.findByOrderIdOrderByLineNoAsc(orderId);
        List<OrderItem> chosen = all.stream().filter(i -> wanted.contains(i.getId())).toList();
        if (chosen.size() != wanted.size()) {
            throw new NotFoundException("Alguna línea no es de este pedido.");
        }
        if (chosen.stream().anyMatch(OrderItem::isDelivered)) {
            throw new ConflictException("Alguna de esas líneas ya se entregó.");
        }
        CustomerRef customer = customers.find(order.getCustomerId())
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
        BusinessSettings cfg = settings.current();
        Map<UUID, StockProduct> products = catalog.stockProducts(chosen.stream().map(OrderItem::getProductId).toList());
        List<ItemLine> lines = new ArrayList<>();
        List<String> names = new ArrayList<>();
        BigDecimal saleTotal = BigDecimal.ZERO;
        for (OrderItem item : chosen) {
            // El total se calcula como lo hará la venta (impuesto y "precios con IVA" vigentes hoy).
            BigDecimal taxRate = pricing.price(item.getProductId(), null, customer.priceListId()).taxRate();
            saleTotal = saleTotal.add(SaleCalculator.line(item.getUnitPrice(), item.getQuantity(), BigDecimal.ZERO,
                    taxRate, cfg.pricesIncludeTax()).total());
            lines.add(new ItemLine(item.getProductId(), null, item.getQuantity(), null, item.getUnitPrice()));
            StockProduct product = products.get(item.getProductId());
            String base = product == null ? null : product.name();
            names.add(item.getDescription() == null ? base
                    : base == null ? item.getDescription() : base + " · " + item.getDescription());
        }
        BigDecimal agreed = chosen.stream().map(OrderItem::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (agreed.compareTo(saleTotal) != 0) {
            // Cambió el impuesto del producto o "precios con IVA" desde que se hizo el pedido: no se cobra distinto
            // de lo acordado sin que alguien lo revise.
            throw new BusinessRuleException("El valor de lo que entregas cambió con los impuestos de hoy ($ "
                    + pesos(agreed) + " → $ " + pesos(saleTotal) + "). Edita el pedido para actualizar los precios.");
        }
        BigDecimal available = payments.available(orderId).max(BigDecimal.ZERO);
        BigDecimal applied = available.min(saleTotal);
        boolean completes = all.size() == chosen.size() + all.stream().filter(OrderItem::isDelivered).count();
        if (completes && available.compareTo(applied) > 0) {
            throw new BusinessRuleException("Quedarían $ " + pesos(available.subtract(applied)) + " de anticipo sin "
                    + "aplicar. Devuélvelos cancelando lo pendiente o revisa los precios del pedido.");
        }
        List<PaymentLine> salePayments = new ArrayList<>();
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        PaymentMethodRef deposit = null;
        if (applied.signum() > 0) {
            deposit = methods.values().stream().filter(m -> DEPOSIT_METHOD.equals(m.code()) && m.active())
                    .findFirst().orElseThrow(() -> new BusinessRuleException("El medio de pago Anticipo está "
                            + "desactivado. Actívalo en Ajustes para entregar pedidos con anticipo."));
            salePayments.add(new PaymentLine(deposit.id(), applied, null));
        }
        if (in.payments() != null) {
            for (PaymentLine p : in.payments()) {
                PaymentMethodRef method = p == null || p.paymentMethodId() == null ? null
                        : methods.get(p.paymentMethodId());
                if (method != null && DEPOSIT_METHOD.equals(method.code())) {
                    throw new BusinessRuleException("El anticipo se aplica solo.");
                }
                salePayments.add(p);
            }
        }
        UUID saleId = sales.createForOrder(new SaleCommands.Create(order.getCustomerId(), lines, salePayments,
                saleTotal, "Pedido " + order.documentNumber()), names, applied, key);
        chosen.forEach(i -> i.deliver(saleId));
        if (applied.signum() > 0) {
            em.persist(OrderPayment.record(new OrderPayment.Data(orderId, OrderPaymentType.APPLIED, applied,
                    deposit.id(), deposit.code(), null, null, null, saleId, null, actor)));
        }
        if (completes) {
            order.markDelivered(actor);
        }
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("saleId", saleId);
        after.put("items", chosen.size());
        after.put("depositApplied", applied);
        after.put("completed", completes);
        audit.log("ORDER_DELIVERED", "order", orderId, null, after);
        return saleId;
    }

    // ------------------------------------------------------------------ cancelar

    /**
     * Cancela lo pendiente (lo entregado ya es una venta y no cambia) y devuelve el anticipo sin aplicar con
     * {@code refundMethodId} (en efectivo sale de la caja abierta de quien cancela). Sobre un pedido ya cancelado solo
     * devuelve el anticipo que volvió a quedar disponible (se anuló la venta de una entrega).
     */
    public OrderView cancel(UUID orderId, CancelInput in) {
        UUID actor = CurrentActor.requireUserId();
        if (in.reason() == null || in.reason().isBlank()) {
            throw new BusinessRuleException("El motivo de la cancelación es obligatorio.");
        }
        tx.executeWithoutResult(status -> {
            CustomerOrder order = orders.lock(orderId)
                    .orElseThrow(() -> new NotFoundException("Pedido no encontrado."));
            em.refresh(order);
            boolean refundOnly = order.getStatus() == OrderStatus.CANCELLED;
            BigDecimal available = payments.available(orderId);
            if (order.getStatus() == OrderStatus.DELIVERED
                    || refundOnly && available.signum() <= 0) {
                throw new ConflictException("El pedido " + order.documentNumber() + " ya está "
                        + (refundOnly ? "cancelado." : "entregado."));
            }
            UUID refundSession = null;
            if (available.signum() > 0) {
                if (in.refundMethodId() == null) {
                    throw new BusinessRuleException("Hay $ " + pesos(available) + " de anticipo: elige cómo se "
                            + "devuelven.");
                }
                PaymentMethodRef method = moneyMethod(in.refundMethodId());
                if (method.requiresReference() && !method.affectsCash() && clean(in.reference(), 60) == null) {
                    throw new BusinessRuleException("La devolución con " + method.name() + " requiere una referencia.");
                }
                Optional<OpenSession> session = cash.lockOpenSessionOf(actor);
                if (method.affectsCash() && session.isEmpty()) {
                    throw new BusinessRuleException("Abre tu caja para devolver el anticipo en efectivo.");
                }
                refundSession = session.map(OpenSession::id).orElse(null);
                OrderPayment refund = OrderPayment.record(new OrderPayment.Data(orderId, OrderPaymentType.REFUND,
                        available, method.id(), method.code(), clean(in.reference(), 60),
                        refundOnly ? clean(in.reason(), 255) : "Devolución por cancelación", refundSession, null, null,
                        actor));
                em.persist(refund);
                if (method.affectsCash()) {
                    cash.recordOrderRefundCash(refundSession, available, refund.getId(),
                            "Devolución anticipo " + order.documentNumber());
                }
            }
            String reason = in.reason().trim();
            if (!refundOnly) {
                order.cancel(reason.length() > 255 ? reason.substring(0, 255) : reason, actor);
            }
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("reason", refundOnly ? reason : order.getCancelReason());
            after.put("refunded", available.max(BigDecimal.ZERO));
            after.put("refundCashSessionId", refundSession);
            audit.log(refundOnly ? "ORDER_DEPOSIT_REFUNDED" : "ORDER_CANCELLED", "order", orderId, null, after);
        });
        return tx.execute(status -> queries.view(orderId));
    }

    // ------------------------------------------------------------------ apoyo

    private CustomerOrder lockOpen(UUID orderId) {
        CustomerOrder order = orders.lock(orderId).orElseThrow(() -> new NotFoundException("Pedido no encontrado."));
        em.refresh(order);
        if (!order.isOpen()) {
            throw new ConflictException("El pedido " + order.documentNumber() + " ya está "
                    + (order.getStatus().name().equals("DELIVERED") ? "entregado." : "cancelado."));
        }
        return order;
    }

    private CustomerRef requireCustomer(UUID customerId) {
        if (customerId == null || CustomerApi.FINAL_CONSUMER_ID.equals(customerId)) {
            throw new BusinessRuleException("Elige el cliente del pedido (con nombre y teléfono para avisarle).");
        }
        CustomerRef customer = customers.find(customerId)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
        if (!customer.active()) {
            throw new BusinessRuleException("El cliente " + customer.name() + " está inactivo.");
        }
        return customer;
    }

    private LocalDate requireDueDate(LocalDate due) {
        if (due == null) {
            throw new BusinessRuleException("Escribe la fecha de entrega.");
        }
        if (due.isBefore(queries.today())) {
            throw new BusinessRuleException("La fecha de entrega no puede ser anterior a hoy.");
        }
        return due;
    }

    /** Precio, cantidad (o área) y total de cada línea, como los calculará la venta al entregar. */
    private List<OrderItem.Data> price(List<ItemInput> input, CustomerRef customer) {
        if (input == null || input.isEmpty()) {
            throw new BusinessRuleException("El pedido debe tener al menos un producto.");
        }
        if (input.size() > MAX_ITEMS) {
            throw new BusinessRuleException("Máximo " + MAX_ITEMS + " líneas por pedido.");
        }
        BusinessSettings cfg = settings.current();
        Set<UUID> ids = new LinkedHashSet<>();
        for (ItemInput line : input) {
            if (line == null || line.productId() == null) {
                throw new BusinessRuleException("Cada línea necesita un producto.");
            }
            ids.add(line.productId());
        }
        Map<UUID, StockProduct> products = catalog.stockProducts(ids);
        List<OrderItem.Data> result = new ArrayList<>();
        for (ItemInput line : input) {
            StockProduct product = products.get(line.productId());
            if (product == null || !product.active()) {
                throw new BusinessRuleException("Uno de los productos no existe o está inactivo.");
            }
            BigDecimal width = line.width();
            BigDecimal length = line.length();
            BigDecimal quantity;
            if (width != null || length != null) {
                if (width == null || length == null || width.signum() <= 0 || length.signum() <= 0
                        || width.compareTo(MAX_SIDE) > 0 || length.compareTo(MAX_SIDE) > 0) {
                    throw new BusinessRuleException("Las medidas de " + product.name() + " no son válidas (ancho y "
                            + "largo en metros).");
                }
                width = width.setScale(3, RoundingMode.HALF_UP);
                length = length.setScale(3, RoundingMode.HALF_UP);
                quantity = width.multiply(length).setScale(4, RoundingMode.HALF_UP);
            } else {
                quantity = line.quantity() == null ? null : line.quantity().setScale(4, RoundingMode.HALF_UP);
            }
            if (quantity == null || quantity.signum() <= 0 || quantity.compareTo(new BigDecimal("1000000")) > 0) {
                throw new BusinessRuleException("La cantidad de " + product.name() + " no es válida.");
            }
            if (!product.baseUnitAllowsDecimals() && quantity.stripTrailingZeros().scale() > 0) {
                throw new BusinessRuleException(product.name() + " se vende en unidades enteras ("
                        + product.baseUnitCode() + "). Para cobrar por medidas usa un producto en M2.");
            }
            BigDecimal unitPrice = line.unitPrice() == null ? null : line.unitPrice().setScale(2, RoundingMode.HALF_UP);
            if (unitPrice == null || unitPrice.signum() <= 0) {
                throw new BusinessRuleException("Escribe el precio de " + product.name() + ".");
            }
            BigDecimal taxRate = pricing.price(line.productId(), null, customer.priceListId()).taxRate();
            BigDecimal total = SaleCalculator.line(unitPrice, quantity, BigDecimal.ZERO, taxRate,
                    cfg.pricesIncludeTax()).total();
            result.add(new OrderItem.Data(line.productId(), clean(line.description(), 200), width, length, quantity,
                    unitPrice, total));
        }
        return result;
    }

    private BigDecimal pendingTotal(UUID orderId) {
        return items.findByOrderIdOrderByLineNoAsc(orderId).stream().filter(i -> !i.isDelivered())
                .map(OrderItem::getTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** Medio para recibir o devolver dinero: ni "Fiado" ni "Anticipo". */
    private PaymentMethodRef moneyMethod(UUID methodId) {
        PaymentMethodRef method = methodId == null ? null : cash.paymentMethods().get(methodId);
        if (method == null || !method.active() || CREDIT_METHOD.equals(method.code())
                || DEPOSIT_METHOD.equals(method.code())) {
            throw new BusinessRuleException("Medio de pago no válido.");
        }
        return method;
    }

    private static void requireSessionFor(PaymentMethodRef method, Optional<OpenSession> session, String action) {
        if (method.affectsCash() && session.isEmpty()) {
            throw new BusinessRuleException("Abre tu caja para " + action + " en efectivo.");
        }
        if (session.isEmpty() && !CurrentActor.permissions().contains(MANAGE_PERMISSION)) {
            throw new ForbiddenException("Abre tu caja para " + action + ". Sin caja, solo el dueño o un "
                    + "administrador los registra.");
        }
    }

    private static BigDecimal sum(List<OrderItem.Data> lines) {
        return lines.stream().map(OrderItem.Data::total).reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static String clean(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() > max ? trimmed.substring(0, max) : trimmed;
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

    /** 1500000 → "1.500.000". */
    static String pesos(BigDecimal value) {
        return String.format(Locale.forLanguageTag("es-CO"), "%,d",
                value.setScale(0, RoundingMode.HALF_UP).longValueExact());
    }
}
