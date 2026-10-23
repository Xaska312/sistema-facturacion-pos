package com.poshibrido.quotes.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.catalog.application.InventoryCatalogApi;
import com.poshibrido.catalog.application.InventoryCatalogApi.StockProduct;
import com.poshibrido.catalog.application.PricingApi;
import com.poshibrido.orders.application.OrderService;
import com.poshibrido.orders.application.OrderViews.OrderView;
import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.parties.application.CustomerApi.CustomerRef;
import com.poshibrido.quotes.application.QuoteViews.QuoteView;
import com.poshibrido.quotes.application.QuoteViews.SaleResult;
import com.poshibrido.quotes.domain.Quote;
import com.poshibrido.quotes.domain.QuoteConversion;
import com.poshibrido.quotes.domain.QuoteItem;
import com.poshibrido.quotes.infrastructure.QuoteItemRepository;
import com.poshibrido.quotes.infrastructure.QuoteRepository;
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
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Cotizaciones (decisión 260): crear y editar mientras están abiertas, rechazar, y convertir una aceptada en un pedido
 * por encargo (con sus medidas y el precio neto de descuento) o en una venta con los precios y descuentos cotizados.
 * Orden de bloqueos: cotización → (pedido nuevo) → caja → inventario → consecutivo, como en la venta.
 */
@Service
public class QuoteService {

    static final String SEQUENCE = "QUOTE";
    static final String DISCOUNT_PERMISSION = "sales:discount";
    static final int MAX_ITEMS = 100;
    private static final BigDecimal MAX_SIDE = new BigDecimal("100");
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");

    private final QuoteRepository quotes;
    private final QuoteItemRepository items;
    private final QuoteQueryService queries;
    private final CustomerApi customers;
    private final PricingApi pricing;
    private final InventoryCatalogApi catalog;
    private final BusinessSettingsApi settings;
    private final DocumentSequences sequences;
    private final OrderService orders;
    private final SaleService sales;
    private final AuditLogger audit;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    public QuoteService(QuoteRepository quotes, QuoteItemRepository items, QuoteQueryService queries,
                        CustomerApi customers, PricingApi pricing, InventoryCatalogApi catalog,
                        BusinessSettingsApi settings, DocumentSequences sequences, OrderService orders,
                        SaleService sales, AuditLogger audit, PlatformTransactionManager transactionManager) {
        this.quotes = quotes;
        this.items = items;
        this.queries = queries;
        this.customers = customers;
        this.pricing = pricing;
        this.catalog = catalog;
        this.settings = settings;
        this.sequences = sequences;
        this.orders = orders;
        this.sales = sales;
        this.audit = audit;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** {@code width}/{@code length} en metros (los dos o ninguno): la cantidad es el área en m². */
    public record ItemInput(UUID productId, String description, BigDecimal width, BigDecimal length,
                            BigDecimal quantity, BigDecimal unitPrice, BigDecimal discountPercent) {
    }

    /**
     * {@code customerId} o, si es nulo, {@code prospectName} (y {@code prospectPhone} opcional). {@code validUntil}
     * nula = hoy + los días de Ajustes; {@code terms} nulas = las de Ajustes.
     */
    public record QuoteInput(UUID customerId, String prospectName, String prospectPhone, LocalDate validUntil,
                             String notes, String terms, List<ItemInput> items) {
    }

    /** {@code customerId}: obligatorio si la cotización es de un prospecto (se registra antes como cliente). */
    public record ToOrderInput(UUID customerId, LocalDate dueDate, String address, String notes) {
    }

    /** {@code customerId}: para un prospecto, el cliente registrado o nulo (consumidor final). */
    public record SellInput(UUID customerId, List<PaymentLine> payments) {
    }

    // ------------------------------------------------------------------ crear, editar y rechazar

    public QuoteView create(QuoteInput in) {
        UUID actor = CurrentActor.requireUserId();
        UUID id = tx.execute(status -> {
            BusinessSettings cfg = settings.current();
            Quote.Party party = party(in);
            LocalDate validUntil = in.validUntil() == null
                    ? queries.today().plusDays(cfg.quoteValidityDays()) : requireFuture(in.validUntil());
            List<QuoteItem.Data> lines = price(in.items(), party.customerId(), cfg);
            DocumentSequences.Next next = sequences.next(SEQUENCE);
            String terms = in.terms() == null ? clean(cfg.quoteTerms(), 1000) : clean(in.terms(), 1000);
            Quote quote = Quote.create(next.prefix(), next.number(), party, validUntil, clean(in.notes(), 1000), terms,
                    sum(lines), actor);
            em.persist(quote);
            int lineNo = 0;
            for (QuoteItem.Data line : lines) {
                em.persist(QuoteItem.of(quote.getId(), ++lineNo, line));
            }
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("number", quote.documentNumber());
            after.put("customerId", party.customerId());
            after.put("prospectName", party.prospectName());
            after.put("total", quote.getTotal());
            after.put("validUntil", validUntil.toString());
            audit.log("QUOTE_CREATED", "quote", quote.getId(), null, after);
            return quote.getId();
        });
        return tx.execute(status -> queries.view(id));
    }

    /**
     * Solo abiertas (también vencidas: así se renuevan). Reemplaza todas las líneas. Sin {@code validUntil} o sin
     * {@code terms} (nulos) se conservan los guardados; {@code terms} vacío las quita.
     */
    public QuoteView update(UUID quoteId, QuoteInput in) {
        UUID actor = CurrentActor.requireUserId();
        tx.executeWithoutResult(status -> {
            Quote quote = lockOpen(quoteId);
            BusinessSettings cfg = settings.current();
            Quote.Party party = party(in);
            // Una fecha que no cambia se acepta aunque ya pasó (editar una vencida sin renovarla).
            LocalDate validUntil = in.validUntil() == null || in.validUntil().equals(quote.getValidUntil())
                    ? quote.getValidUntil() : requireFuture(in.validUntil());
            List<QuoteItem.Data> lines = price(in.items(), party.customerId(), cfg);
            BigDecimal before = quote.getTotal();
            items.findByQuoteIdOrderByLineNoAsc(quoteId).forEach(em::remove);
            em.flush();
            int lineNo = 0;
            for (QuoteItem.Data line : lines) {
                em.persist(QuoteItem.of(quoteId, ++lineNo, line));
            }
            String terms = in.terms() == null ? quote.getTerms() : clean(in.terms(), 1000);
            quote.update(party, validUntil, clean(in.notes(), 1000), terms, sum(lines), actor);
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("totalBefore", before);
            after.put("total", quote.getTotal());
            after.put("validUntil", validUntil.toString());
            audit.log("QUOTE_UPDATED", "quote", quoteId, null, after);
        });
        return tx.execute(status -> queries.view(quoteId));
    }

    public QuoteView reject(UUID quoteId, String reason) {
        UUID actor = CurrentActor.requireUserId();
        String why = clean(reason, 255);
        if (why == null) {
            throw new BusinessRuleException("Escribe el motivo (por ejemplo, \"le pareció caro\").");
        }
        tx.executeWithoutResult(status -> {
            Quote quote = lockOpen(quoteId);
            quote.reject(why, actor);
            audit.log("QUOTE_REJECTED", "quote", quoteId, null, Map.of("reason", why));
        });
        return tx.execute(status -> queries.view(quoteId));
    }

    // ------------------------------------------------------------------ convertir

    /**
     * Pedido por encargo con las líneas de la cotización: medidas, descripción y el precio neto de descuento (el
     * pedido no maneja descuentos; el total puede variar unos pesos por el redondeo del precio).
     */
    public QuoteView toOrder(UUID quoteId, ToOrderInput in) {
        UUID actor = CurrentActor.requireUserId();
        tx.executeWithoutResult(status -> {
            Quote quote = lockConvertible(quoteId);
            UUID customerId = quote.getCustomerId() != null ? quote.getCustomerId() : in.customerId();
            if (customerId == null) {
                throw new BusinessRuleException("Registra al cliente para crear el pedido (con su documento y "
                        + "teléfono).");
            }
            List<OrderService.ItemInput> lines = new ArrayList<>();
            for (QuoteItem item : items.findByQuoteIdOrderByLineNoAsc(quoteId)) {
                BigDecimal net = item.getUnitPrice()
                        .multiply(HUNDRED.subtract(item.getDiscountPercent()))
                        .divide(HUNDRED, 2, RoundingMode.HALF_UP);
                boolean bySize = item.getWidth() != null;
                lines.add(new OrderService.ItemInput(item.getProductId(), item.getDescription(),
                        item.getWidth(), item.getLength(), bySize ? null : item.getQuantity(), net));
            }
            String notes = in.notes() != null && !in.notes().isBlank() ? in.notes() : quote.getNotes();
            OrderView order = orders.create(new OrderService.OrderInput(customerId, in.dueDate(), in.address(),
                    notes, lines));
            if (quote.getCustomerId() == null) {
                quote.assignCustomer(customerId, actor);
            }
            quote.accept(QuoteConversion.ORDER, order.id(), actor);
            Map<String, Object> after = new LinkedHashMap<>();
            after.put("type", QuoteConversion.ORDER.name());
            after.put("orderId", order.id());
            after.put("orderNumber", order.number());
            audit.log("QUOTE_CONVERTED", "quote", quoteId, null, after);
        });
        return tx.execute(status -> queries.view(quoteId));
    }

    /**
     * Venta con los precios y descuentos cotizados, en la caja abierta de quien vende. La {@code Idempotency-Key} es
     * la de la venta: repetirla devuelve la misma venta. Si el total cambió (impuestos), 409 y hay que editarla.
     */
    public SaleResult sell(UUID quoteId, SellInput in, String idempotencyKey) {
        String key = requireKey(idempotencyKey);
        Optional<UUID> existing = sales.existingSale(key);
        if (existing.isPresent()) {
            return new SaleResult(tx.execute(status -> queries.view(quoteId)), belongsTo(existing.get(), quoteId));
        }
        UUID saleId;
        try {
            saleId = tx.execute(status -> registerSale(quoteId, in, key));
        } catch (RuntimeException ex) {
            Optional<UUID> winner = sales.existingSale(key);
            if (winner.isEmpty()) {
                throw ex;
            }
            saleId = belongsTo(winner.get(), quoteId);
        }
        UUID id = saleId;
        return new SaleResult(tx.execute(status -> queries.view(quoteId)), id);
    }

    private UUID registerSale(UUID quoteId, SellInput in, String key) {
        UUID actor = CurrentActor.requireUserId();
        Quote quote = lockConvertible(quoteId);
        UUID customerId = quote.getCustomerId() != null ? quote.getCustomerId() : in.customerId();
        List<QuoteItem> quoteItems = items.findByQuoteIdOrderByLineNoAsc(quoteId);
        Map<UUID, StockProduct> products = catalog.stockProducts(
                quoteItems.stream().map(QuoteItem::getProductId).toList());
        List<ItemLine> lines = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (QuoteItem item : quoteItems) {
            lines.add(new ItemLine(item.getProductId(), null, item.getQuantity(), item.getDiscountPercent(),
                    item.getUnitPrice()));
            StockProduct product = products.get(item.getProductId());
            String base = product == null ? null : product.name();
            names.add(item.getDescription() == null ? base
                    : base == null ? item.getDescription() : base + " · " + item.getDescription());
        }
        UUID saleId = sales.createForQuote(new SaleCommands.Create(customerId, lines, in.payments(), quote.getTotal(),
                "Cotización " + quote.documentNumber()), names, key);
        if (quote.getCustomerId() == null && customerId != null && !CustomerApi.FINAL_CONSUMER_ID.equals(customerId)) {
            quote.assignCustomer(customerId, actor);
        }
        quote.accept(QuoteConversion.SALE, saleId, actor);
        Map<String, Object> after = new LinkedHashMap<>();
        after.put("type", QuoteConversion.SALE.name());
        after.put("saleId", saleId);
        audit.log("QUOTE_CONVERTED", "quote", quoteId, null, after);
        return saleId;
    }

    /** Un reintento con la clave de una venta que no es la de esta cotización es un error del cliente. */
    private UUID belongsTo(UUID saleId, UUID quoteId) {
        Boolean ok = tx.execute(status -> quotes.findById(quoteId)
                .map(q -> q.getConvertedType() == QuoteConversion.SALE && saleId.equals(q.getConvertedId()))
                .orElse(false));
        if (!Boolean.TRUE.equals(ok)) {
            throw new ConflictException("Esta Idempotency-Key ya se usó en otra venta.");
        }
        return saleId;
    }

    // ------------------------------------------------------------------ apoyo

    private Quote lockOpen(UUID quoteId) {
        Quote quote = quotes.lock(quoteId).orElseThrow(() -> new NotFoundException("Cotización no encontrada."));
        em.refresh(quote);
        if (!quote.isOpen()) {
            throw new ConflictException("La cotización " + quote.documentNumber() + " ya está "
                    + (quote.getStatus().name().equals("ACCEPTED") ? "aceptada." : "rechazada."));
        }
        return quote;
    }

    /** Abierta y vigente: una vencida se renueva (editando la fecha) antes de convertirla. */
    private Quote lockConvertible(UUID quoteId) {
        Quote quote = lockOpen(quoteId);
        if (quote.getValidUntil().isBefore(queries.today())) {
            throw new BusinessRuleException("La cotización " + quote.documentNumber() + " venció. Revisa los precios "
                    + "y cambia la fecha de validez para renovarla.");
        }
        return quote;
    }

    private Quote.Party party(QuoteInput in) {
        if (in.customerId() != null) {
            if (CustomerApi.FINAL_CONSUMER_ID.equals(in.customerId())) {
                throw new BusinessRuleException("Para alguien sin registrar, escribe su nombre como prospecto.");
            }
            CustomerRef customer = customers.find(in.customerId())
                    .orElseThrow(() -> new NotFoundException("Cliente no encontrado."));
            if (!customer.active()) {
                throw new BusinessRuleException("El cliente " + customer.name() + " está inactivo.");
            }
            return new Quote.Party(customer.id(), null, null);
        }
        String name = clean(in.prospectName(), 160);
        if (name == null) {
            throw new BusinessRuleException("Elige el cliente o escribe el nombre de la persona a quien le cotizas.");
        }
        return new Quote.Party(null, name, clean(in.prospectPhone(), 30));
    }

    private LocalDate requireFuture(LocalDate date) {
        if (date == null) {
            throw new BusinessRuleException("Escribe hasta cuándo es válida la cotización.");
        }
        if (date.isBefore(queries.today())) {
            throw new BusinessRuleException("La fecha de validez no puede ser anterior a hoy.");
        }
        return date;
    }

    /** Precio, cantidad (o área), descuento y total de cada línea, como los calculará la venta. */
    private List<QuoteItem.Data> price(List<ItemInput> input, UUID customerId, BusinessSettings cfg) {
        if (input == null || input.isEmpty()) {
            throw new BusinessRuleException("La cotización debe tener al menos un producto.");
        }
        if (input.size() > MAX_ITEMS) {
            throw new BusinessRuleException("Máximo " + MAX_ITEMS + " líneas por cotización.");
        }
        UUID priceListId = customerId == null ? null
                : customers.find(customerId).map(CustomerRef::priceListId).orElse(null);
        Set<UUID> ids = new LinkedHashSet<>();
        for (ItemInput line : input) {
            if (line == null || line.productId() == null) {
                throw new BusinessRuleException("Cada línea necesita un producto.");
            }
            ids.add(line.productId());
        }
        Map<UUID, StockProduct> products = catalog.stockProducts(ids);
        List<QuoteItem.Data> result = new ArrayList<>();
        BigDecimal maxDiscount = BigDecimal.ZERO;
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
                        + product.baseUnitCode() + "). Para cotizar por medidas usa un producto en M2.");
            }
            BigDecimal unitPrice = line.unitPrice() == null ? null : line.unitPrice().setScale(2, RoundingMode.HALF_UP);
            if (unitPrice == null || unitPrice.signum() <= 0) {
                throw new BusinessRuleException("Escribe el precio de " + product.name() + ".");
            }
            BigDecimal discount = line.discountPercent() == null ? BigDecimal.ZERO.setScale(2)
                    : line.discountPercent().setScale(2, RoundingMode.HALF_UP);
            if (discount.signum() < 0 || discount.compareTo(HUNDRED) >= 0) {
                throw new BusinessRuleException("El descuento de " + product.name() + " debe ser menor que 100 %.");
            }
            maxDiscount = maxDiscount.max(discount);
            BigDecimal taxRate = pricing.price(line.productId(), null, priceListId).taxRate();
            BigDecimal total = SaleCalculator.line(unitPrice, quantity, discount, taxRate, cfg.pricesIncludeTax())
                    .total();
            result.add(new QuoteItem.Data(line.productId(), clean(line.description(), 200), width, length, quantity,
                    unitPrice, discount, total));
        }
        // Lo mismo que exige la venta: así lo cotizado se puede vender sin sorpresas.
        if (maxDiscount.compareTo(cfg.maxDiscountPercent()) > 0
                && !CurrentActor.permissions().contains(DISCOUNT_PERMISSION)) {
            throw new ForbiddenException("Necesitas el permiso de descuentos para dar más del "
                    + cfg.maxDiscountPercent().stripTrailingZeros().toPlainString() + " %.");
        }
        return result;
    }

    private static BigDecimal sum(List<QuoteItem.Data> lines) {
        return lines.stream().map(QuoteItem.Data::total).reduce(BigDecimal.ZERO, BigDecimal::add)
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
}
