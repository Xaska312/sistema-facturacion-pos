package com.poshibrido.orders.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.orders.application.OrderViews.ItemView;
import com.poshibrido.orders.application.OrderViews.OrderRow;
import com.poshibrido.orders.application.OrderViews.OrderView;
import com.poshibrido.orders.application.OrderViews.PaymentView;
import com.poshibrido.orders.application.OrderViews.Summary;
import com.poshibrido.orders.domain.OrderPaymentType;
import com.poshibrido.orders.domain.OrderStatus;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Consultas de pedidos por encargo (decisión 258). */
@Service
@RequiredArgsConstructor
public class OrderQueryService {

    /** Filtro de la lista: abiertos, atrasados (abiertos con la fecha vencida), entregados, cancelados o todos. */
    public enum Filter { OPEN, OVERDUE, DELIVERED, CANCELLED, ALL }

    private static final int MAX_PAGE = 100;

    private static final String CUSTOMER_NAME = """
            CASE WHEN p.person_type = 'LEGAL' THEN p.business_name
                 ELSE trim(p.first_names || ' ' || p.last_names) END""";

    /** Totales por pedido: pendiente (sin entregar), anticipo disponible y anticipos netos. */
    private static final String AMOUNTS = """
            coalesce((SELECT sum(i.total) FROM order_items i WHERE i.order_id = o.id AND i.sale_id IS NULL), 0)
                AS pending,
            coalesce((SELECT sum(x.amount) FROM order_payments x WHERE x.order_id = o.id), 0) AS available,
            coalesce((SELECT sum(x.amount) FROM order_payments x
                      WHERE x.order_id = o.id AND x.type IN ('DEPOSIT', 'REFUND')), 0) AS deposited""";

    private final MemberDirectory members;
    private final BusinessSettingsApi settings;

    @PersistenceContext
    private EntityManager em;

    public LocalDate today() {
        return LocalDate.now(ZoneId.of(settings.current().timezone()));
    }

    @Transactional(readOnly = true)
    public PageResponse<OrderRow> list(Filter filter, String search, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE);
        Filter f = filter == null ? Filter.OPEN : filter;
        String where = """
                (:anyStatus OR o.status = :status)
                AND (NOT :overdueOnly OR (o.status = 'OPEN' AND o.due_date < :today))
                AND (:noSearch OR lower(%s) LIKE :pattern OR p.document_number LIKE :pattern
                     OR CAST(o.number AS text) = :numberText)
                """.formatted(CUSTOMER_NAME);
        Query count = em.createNativeQuery("SELECT count(*) FROM orders o JOIN parties p ON p.id = o.customer_id WHERE "
                + where);
        bindList(count, f, search);
        long total = Rows.lng(count.getSingleResult());

        Query query = em.createNativeQuery("""
                SELECT o.id, o.prefix || '-' || o.number AS number, o.status, o.customer_id, %s AS customer_name,
                       o.due_date, o.total, %s,
                       (SELECT count(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
                       (SELECT count(*) FROM order_items i WHERE i.order_id = o.id AND i.sale_id IS NOT NULL)
                           AS delivered_count,
                       o.created_at
                FROM orders o JOIN parties p ON p.id = o.customer_id
                WHERE %s
                ORDER BY CASE WHEN o.status = 'OPEN' THEN 0 ELSE 1 END,
                         CASE WHEN o.status = 'OPEN' THEN o.due_date END, o.created_at DESC, o.id
                LIMIT :size OFFSET :offset
                """.formatted(CUSTOMER_NAME, AMOUNTS, where));
        bindList(query, f, search);
        query.setParameter("size", safeSize);
        query.setParameter("offset", (long) safePage * safeSize);
        LocalDate today = today();
        List<OrderRow> rows = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            OrderStatus status = OrderStatus.valueOf(Rows.str(r[2]));
            LocalDate due = Rows.date(r[5]);
            BigDecimal pending = Rows.decimal(r[7]);
            BigDecimal available = Rows.decimal(r[8]);
            rows.add(new OrderRow(Rows.uuid(r[0]), Rows.str(r[1]), status, Rows.uuid(r[3]), Rows.str(r[4]), due,
                    status == OrderStatus.OPEN && due.isBefore(today), Rows.decimal(r[6]), Rows.decimal(r[9]),
                    status == OrderStatus.OPEN ? pending.subtract(available) : BigDecimal.ZERO, Rows.lng(r[10]),
                    Rows.lng(r[11]), Rows.instant(r[12])));
        }
        int pages = (int) Math.ceil(total / (double) safeSize);
        return new PageResponse<>(rows, safePage, safeSize, total, pages);
    }

    @Transactional(readOnly = true)
    public Summary summary() {
        LocalDate today = today();
        Query query = em.createNativeQuery("""
                SELECT count(*),
                       count(*) FILTER (WHERE o.due_date < :today),
                       count(*) FILTER (WHERE o.due_date = :today),
                       count(*) FILTER (WHERE o.due_date > :today AND o.due_date <= :soon),
                       coalesce(sum(t.pending - t.available), 0)
                FROM orders o
                CROSS JOIN LATERAL (SELECT %s) t
                WHERE o.status = 'OPEN'
                """.formatted(AMOUNTS));
        query.setParameter("today", today);
        query.setParameter("soon", today.plusDays(3));
        Object[] r = (Object[]) query.getSingleResult();
        return new Summary(Rows.lng(r[0]), Rows.lng(r[1]), Rows.lng(r[2]), Rows.lng(r[3]), Rows.decimal(r[4]));
    }

    @Transactional(readOnly = true)
    public OrderView view(UUID orderId) {
        Query header = em.createNativeQuery("""
                SELECT o.id, o.prefix || '-' || o.number, o.status, o.customer_id, %s,
                       p.document_type, p.document_number, p.verification_digit, p.phone, o.due_date, o.address,
                       o.notes, o.total, o.created_by, o.created_at, o.delivered_at, o.cancelled_at, o.cancel_reason
                FROM orders o JOIN parties p ON p.id = o.customer_id
                WHERE o.id = :id
                """.formatted(CUSTOMER_NAME));
        header.setParameter("id", orderId);
        List<?> found = header.getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Pedido no encontrado.");
        }
        Object[] h = (Object[]) found.getFirst();

        Query itemQuery = em.createNativeQuery("""
                SELECT i.id, i.line_no, i.product_id, pr.sku, pr.name, u.code, i.description, i.width, i.length,
                       i.quantity, i.unit_price, i.total, i.sale_id,
                       CASE WHEN s.id IS NULL THEN NULL ELSE s.prefix || '-' || s.number END, i.delivered_at
                FROM order_items i
                JOIN products pr ON pr.id = i.product_id
                JOIN units u ON u.id = pr.base_unit_id
                LEFT JOIN sales s ON s.id = i.sale_id
                WHERE i.order_id = :id
                ORDER BY i.line_no
                """);
        itemQuery.setParameter("id", orderId);
        List<ItemView> items = new ArrayList<>();
        BigDecimal delivered = BigDecimal.ZERO;
        BigDecimal pending = BigDecimal.ZERO;
        for (Object row : itemQuery.getResultList()) {
            Object[] r = (Object[]) row;
            boolean isDelivered = r[12] != null;
            BigDecimal total = Rows.decimal(r[11]);
            if (isDelivered) {
                delivered = delivered.add(total);
            } else {
                pending = pending.add(total);
            }
            items.add(new ItemView(Rows.uuid(r[0]), (int) Rows.lng(r[1]), Rows.uuid(r[2]), Rows.str(r[3]),
                    Rows.str(r[4]), Rows.str(r[5]), Rows.str(r[6]), r[7] == null ? null : Rows.decimal(r[7]),
                    r[8] == null ? null : Rows.decimal(r[8]), Rows.decimal(r[9]), Rows.decimal(r[10]), total,
                    isDelivered, Rows.uuid(r[12]), Rows.str(r[13]), Rows.instant(r[14])));
        }

        Query paymentQuery = em.createNativeQuery("""
                SELECT x.id, x.entry_no, x.type, x.amount, x.method_code, pm.name, x.reference, x.notes, x.sale_id,
                       CASE WHEN s.id IS NULL THEN NULL ELSE s.prefix || '-' || s.number END, x.created_by,
                       x.created_at
                FROM order_payments x
                LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id
                LEFT JOIN sales s ON s.id = x.sale_id
                WHERE x.order_id = :id
                ORDER BY x.entry_no
                """);
        paymentQuery.setParameter("id", orderId);
        List<Object[]> paymentRows = new ArrayList<>();
        Set<UUID> people = new HashSet<>();
        people.add(Rows.uuid(h[13]));
        for (Object row : paymentQuery.getResultList()) {
            Object[] r = (Object[]) row;
            paymentRows.add(r);
            if (r[10] != null) {
                people.add(Rows.uuid(r[10]));
            }
        }
        Map<UUID, String> names = members.displayNames(people);
        List<PaymentView> payments = new ArrayList<>();
        BigDecimal available = BigDecimal.ZERO;
        BigDecimal deposited = BigDecimal.ZERO;
        for (Object[] r : paymentRows) {
            OrderPaymentType type = OrderPaymentType.valueOf(Rows.str(r[2]));
            BigDecimal amount = Rows.decimal(r[3]);
            available = available.add(amount);
            if (type == OrderPaymentType.DEPOSIT || type == OrderPaymentType.REFUND) {
                deposited = deposited.add(amount);
            }
            payments.add(new PaymentView(Rows.uuid(r[0]), Rows.lng(r[1]), type, amount, Rows.str(r[4]),
                    Rows.str(r[5]), Rows.str(r[6]), Rows.str(r[7]), Rows.uuid(r[8]), Rows.str(r[9]),
                    names.get(Rows.uuid(r[10])), Rows.instant(r[11])));
        }

        OrderStatus status = OrderStatus.valueOf(Rows.str(h[2]));
        LocalDate due = Rows.date(h[9]);
        String documentType = Rows.str(h[5]);
        String document = "NIT".equals(documentType) && h[7] != null ? h[6] + "-" + h[7] : Rows.str(h[6]);
        BigDecimal balanceDue = status == OrderStatus.OPEN ? pending.subtract(available) : BigDecimal.ZERO;
        return new OrderView(Rows.uuid(h[0]), Rows.str(h[1]), status, Rows.uuid(h[3]), Rows.str(h[4]),
                documentType + " " + document, Rows.str(h[8]), due,
                status == OrderStatus.OPEN && due.isBefore(today()), Rows.str(h[10]), Rows.str(h[11]),
                Rows.decimal(h[12]), delivered, pending, deposited, available, balanceDue,
                names.get(Rows.uuid(h[13])), Rows.instant(h[14]), Rows.instant(h[15]), Rows.instant(h[16]),
                Rows.str(h[17]), items, payments);
    }

    private void bindList(Query query, Filter filter, String search) {
        boolean anyStatus = filter == Filter.ALL || filter == Filter.OVERDUE;
        query.setParameter("anyStatus", anyStatus);
        query.setParameter("status", anyStatus ? OrderStatus.OPEN.name() : filter.name());
        query.setParameter("overdueOnly", filter == Filter.OVERDUE);
        query.setParameter("today", today());
        boolean noSearch = search == null || search.isBlank();
        String term = noSearch ? "" : search.trim().toLowerCase(Locale.ROOT);
        query.setParameter("noSearch", noSearch);
        query.setParameter("pattern", noSearch ? "" : "%" + escape(term) + "%");
        query.setParameter("numberText", term.replaceFirst("^ped-?", ""));
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
