package com.poshibrido.credit.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.credit.application.CreditViews.AccountView;
import com.poshibrido.credit.application.CreditViews.EntryView;
import com.poshibrido.credit.application.CreditViews.Summary;
import com.poshibrido.credit.domain.CreditEntryType;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.NotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Consultas del fiado: cartera, cuenta de un cliente y su estado de cuenta (decisión 255). */
@Service
@RequiredArgsConstructor
public class CreditQueryService {

    /** Filtro de la cartera: solo quienes deben, o todos los que tienen cupo o algún saldo. */
    public enum Filter { DEBT, ALL }

    private static final UUID NONE = new UUID(0, 0);
    private static final int MAX_PAGE = 100;

    /**
     * Deuda abierta por venta fiada: los abonos pagan primero lo más viejo, así que el saldo queda en las ventas
     * fiadas más recientes. Solo cuentan las ventas fiadas que no se anularon (una anulación cancela su venta y un
     * abono anulado cancela su abono, así que el saldo es lo fiado vigente menos los abonos vigentes). Para cada
     * venta (de la más reciente hacia atrás) {@code cum} suma lo fiado desde ella; queda pendiente lo que cabe en el
     * saldo.
     */
    private static final String CTE = """
            WITH open_debits AS (
                SELECT d.customer_id, d.created_at, LEAST(d.amount, a.balance - (d.cum - d.amount)) AS open_amount
                FROM (SELECT e.customer_id, e.created_at, e.amount,
                             sum(e.amount) OVER (PARTITION BY e.customer_id ORDER BY e.entry_no DESC) AS cum
                      FROM credit_entries e
                      WHERE e.type = 'SALE' AND NOT EXISTS (SELECT 1 FROM credit_entries x
                                                            WHERE x.sale_id = e.sale_id AND x.type = 'SALE_VOID')) d
                JOIN credit_accounts a ON a.customer_id = d.customer_id
                WHERE a.balance > 0 AND d.cum - d.amount < a.balance
            ), aging AS (
                SELECT customer_id, min(created_at) AS oldest_at,
                       coalesce(sum(open_amount) FILTER (WHERE created_at >= :d30), 0) AS up_to_30,
                       coalesce(sum(open_amount) FILTER (WHERE created_at < :d30 AND created_at >= :d60), 0) AS d31_60,
                       coalesce(sum(open_amount) FILTER (WHERE created_at < :d60), 0) AS over_60
                FROM open_debits GROUP BY customer_id
            ), last_payment AS (
                SELECT DISTINCT ON (p.customer_id) p.customer_id, p.created_at, -p.amount AS amount
                FROM credit_entries p
                WHERE p.type = 'PAYMENT'
                  AND NOT EXISTS (SELECT 1 FROM credit_entries v WHERE v.payment_id = p.id AND v.type = 'PAYMENT_VOID')
                ORDER BY p.customer_id, p.entry_no DESC
            ), accounts AS (
                SELECT c.party_id AS customer_id,
                       CASE WHEN p.person_type = 'LEGAL' THEN p.business_name
                            ELSE trim(p.first_names || ' ' || p.last_names) END AS name,
                       p.document_type, p.document_number, p.verification_digit, p.phone, c.active,
                       c.credit_limit, coalesce(a.balance, 0) AS balance, ag.oldest_at,
                       coalesce(ag.up_to_30, 0) AS up_to_30, coalesce(ag.d31_60, 0) AS d31_60,
                       coalesce(ag.over_60, 0) AS over_60, lp.created_at AS last_payment_at,
                       lp.amount AS last_payment_amount
                FROM customers c
                JOIN parties p ON p.id = c.party_id
                LEFT JOIN credit_accounts a ON a.customer_id = c.party_id
                LEFT JOIN aging ag ON ag.customer_id = c.party_id
                LEFT JOIN last_payment lp ON lp.customer_id = c.party_id
                WHERE NOT p.system_party
            )
            """;

    private static final String COLUMNS = """
            customer_id, name, document_type, document_number, verification_digit, phone, active, credit_limit,
            balance, oldest_at, up_to_30, d31_60, over_60, last_payment_at, last_payment_amount
            """;

    private final MemberDirectory members;

    @PersistenceContext
    private EntityManager em;

    /** Cartera: clientes con su saldo y su deuda por antigüedad, primero los que más deben. */
    @Transactional(readOnly = true)
    public PageResponse<AccountView> accounts(String search, Filter filter, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE);
        String where = (filter == Filter.ALL ? "(credit_limit > 0 OR balance <> 0)" : "balance > 0")
                + " AND (:noSearch OR lower(name) LIKE :pattern OR document_number LIKE :pattern)";
        String pattern = search == null || search.isBlank()
                ? ""
                : "%" + escape(search.trim().toLowerCase(Locale.ROOT)) + "%";

        Query count = em.createNativeQuery(CTE + "SELECT count(*) FROM accounts WHERE " + where);
        bind(count, search, pattern);
        long total = Rows.lng(count.getSingleResult());

        Query query = em.createNativeQuery(CTE + "SELECT " + COLUMNS + " FROM accounts WHERE " + where
                + " ORDER BY balance DESC, name, customer_id LIMIT :size OFFSET :offset");
        bind(query, search, pattern);
        query.setParameter("size", safeSize);
        query.setParameter("offset", (long) safePage * safeSize);
        List<AccountView> content = new ArrayList<>();
        for (Object row : query.getResultList()) {
            content.add(toAccount((Object[]) row));
        }
        int pages = (int) Math.ceil(total / (double) safeSize);
        return new PageResponse<>(content, safePage, safeSize, total, pages);
    }

    /** Cuenta de un cliente (saldo cero si nunca se le ha fiado). */
    @Transactional(readOnly = true)
    public AccountView account(UUID customerId) {
        Query query = em.createNativeQuery(CTE + "SELECT " + COLUMNS
                + " FROM accounts WHERE customer_id = :customerId");
        bindDates(query);
        query.setParameter("customerId", customerId);
        List<?> rows = query.getResultList();
        if (rows.isEmpty()) {
            throw new NotFoundException("Cliente no encontrado.");
        }
        return toAccount((Object[]) rows.getFirst());
    }

    /** Totales de la cartera (solo clientes que deben). */
    @Transactional(readOnly = true)
    public Summary summary() {
        Query query = em.createNativeQuery(CTE + """
                SELECT coalesce(sum(balance), 0), count(*), coalesce(sum(up_to_30), 0), coalesce(sum(d31_60), 0),
                       coalesce(sum(over_60), 0), count(*) FILTER (WHERE balance > credit_limit)
                FROM accounts WHERE balance > 0
                """);
        bindDates(query);
        Object[] r = (Object[]) query.getSingleResult();
        return new Summary(Rows.decimal(r[0]), Rows.lng(r[1]), Rows.decimal(r[2]), Rows.decimal(r[3]),
                Rows.decimal(r[4]), Rows.lng(r[5]));
    }

    /** Estado de cuenta: movimientos del más reciente al más antiguo, con el saldo después de cada uno. */
    @Transactional(readOnly = true)
    public PageResponse<EntryView> entries(UUID customerId, int page, int size) {
        account(customerId);
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE);
        long total = Rows.lng(em.createNativeQuery("SELECT count(*) FROM credit_entries WHERE customer_id = :id")
                .setParameter("id", customerId).getSingleResult());
        List<EntryView> content = loadEntries(customerId, null, safeSize, (long) safePage * safeSize);
        int pages = (int) Math.ceil(total / (double) safeSize);
        return new PageResponse<>(content, safePage, safeSize, total, pages);
    }

    /** Un movimiento con su saldo (para responder al registrar o anular un abono). */
    @Transactional(readOnly = true)
    public EntryView entry(UUID customerId, UUID entryId) {
        return loadEntries(customerId, entryId, 1, 0).stream().findFirst()
                .orElseThrow(() -> new NotFoundException("Movimiento no encontrado."));
    }

    /** El saldo después de cada movimiento se calcula sobre todos los del cliente, antes de paginar o filtrar. */
    private List<EntryView> loadEntries(UUID customerId, UUID entryId, int limit, long offset) {
        Query query = em.createNativeQuery("""
                SELECT * FROM (
                    SELECT e.id, e.entry_no, e.type, e.amount,
                           sum(e.amount) OVER (ORDER BY e.entry_no) AS balance_after,
                           e.sale_id,
                           CASE WHEN s.id IS NULL THEN NULL ELSE s.prefix || '-' || s.number END AS sale_number,
                           e.payment_id, e.method_code, pm.name AS method_name, e.reference, e.notes, e.created_by,
                           e.created_at, v.id AS void_id, v.notes AS void_notes, v.created_at AS voided_at
                    FROM credit_entries e
                    LEFT JOIN sales s ON s.id = e.sale_id
                    LEFT JOIN payment_methods pm ON pm.id = e.payment_method_id
                    LEFT JOIN credit_entries v ON v.payment_id = e.id AND v.type = 'PAYMENT_VOID'
                    WHERE e.customer_id = :id
                ) x
                WHERE :anyEntry OR x.id = :entryId
                ORDER BY entry_no DESC
                LIMIT :size OFFSET :offset
                """);
        query.setParameter("id", customerId);
        query.setParameter("anyEntry", entryId == null);
        query.setParameter("entryId", entryId == null ? NONE : entryId);
        query.setParameter("size", limit);
        query.setParameter("offset", offset);
        List<Object[]> rows = new ArrayList<>();
        Set<UUID> creators = new HashSet<>();
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            rows.add(r);
            UUID by = Rows.uuid(r[12]);
            if (by != null) {
                creators.add(by);
            }
        }
        Map<UUID, String> names = creators.isEmpty() ? Map.of() : members.displayNames(creators);
        return rows.stream().map(r -> new EntryView(Rows.uuid(r[0]), Rows.lng(r[1]),
                CreditEntryType.valueOf(Rows.str(r[2])), Rows.decimal(r[3]), Rows.decimal(r[4]), Rows.uuid(r[5]),
                Rows.str(r[6]), Rows.uuid(r[7]), Rows.str(r[8]), Rows.str(r[9]), Rows.str(r[10]), Rows.str(r[11]),
                names.get(Rows.uuid(r[12])), Rows.instant(r[13]), r[14] != null, Rows.str(r[15]),
                Rows.instant(r[16]))).toList();
    }

    private void bind(Query query, String search, String pattern) {
        bindDates(query);
        query.setParameter("noSearch", search == null || search.isBlank());
        query.setParameter("pattern", pattern);
    }

    private static void bindDates(Query query) {
        Instant now = Instant.now();
        query.setParameter("d30", now.minus(Duration.ofDays(30)));
        query.setParameter("d60", now.minus(Duration.ofDays(60)));
    }

    private static AccountView toAccount(Object[] r) {
        String documentType = Rows.str(r[2]);
        String number = Rows.str(r[3]);
        Object dv = r[4];
        String formatted = "NIT".equals(documentType) && dv != null ? number + "-" + dv : number;
        BigDecimal limit = Rows.decimal(r[7]);
        BigDecimal balance = Rows.decimal(r[8]);
        BigDecimal available = limit.subtract(balance).max(BigDecimal.ZERO);
        return new AccountView(Rows.uuid(r[0]), Rows.str(r[1]), documentType, formatted, Rows.str(r[5]),
                Rows.bool(r[6]), limit, balance, available, Rows.instant(r[9]), Rows.decimal(r[10]),
                Rows.decimal(r[11]), Rows.decimal(r[12]), Rows.instant(r[13]), Rows.decimalOrNull(r[14]));
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

}
