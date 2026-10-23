package com.poshibrido.quotes.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.organization.application.BusinessSettings;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.quotes.application.QuoteViews.ItemView;
import com.poshibrido.quotes.application.QuoteViews.QuoteConfig;
import com.poshibrido.quotes.application.QuoteViews.QuoteRow;
import com.poshibrido.quotes.application.QuoteViews.QuoteView;
import com.poshibrido.quotes.domain.QuoteConversion;
import com.poshibrido.quotes.domain.QuoteStatus;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Consultas de cotizaciones (decisión 260). */
@Service
@RequiredArgsConstructor
public class QuoteQueryService {

    /** Filtro de la lista: abiertas vigentes, vencidas (abiertas con la fecha pasada), aceptadas, rechazadas o todas. */
    public enum Filter { OPEN, EXPIRED, ACCEPTED, REJECTED, ALL }

    private static final int MAX_PAGE = 100;

    /** Nombre del cliente registrado o, si no hay, el del prospecto. */
    private static final String PARTY_NAME = """
            coalesce(CASE WHEN p.person_type = 'LEGAL' THEN p.business_name
                          ELSE trim(p.first_names || ' ' || p.last_names) END, q.prospect_name)""";

    /** Número del pedido o de la venta en que se convirtió. */
    private static final String CONVERTED_NUMBER = """
            CASE WHEN q.converted_type = 'ORDER' THEN (SELECT o.prefix || '-' || o.number FROM orders o
                                                       WHERE o.id = q.converted_id)
                 WHEN q.converted_type = 'SALE' THEN (SELECT s.prefix || '-' || s.number FROM sales s
                                                      WHERE s.id = q.converted_id) END""";

    private final MemberDirectory members;
    private final BusinessSettingsApi settings;
    private final TenantApi tenants;

    @PersistenceContext
    private EntityManager em;

    public LocalDate today() {
        return LocalDate.now(ZoneId.of(settings.current().timezone()));
    }

    @Transactional(readOnly = true)
    public QuoteConfig config() {
        BusinessSettings cfg = settings.current();
        String businessName = tenants.findInfo(CurrentTenant.require().id()).map(TenantInfo::tradeName).orElse("");
        @SuppressWarnings("unchecked")
        List<Object[]> branch = em.createNativeQuery(
                "SELECT address, phone FROM branches WHERE active ORDER BY created_at, code LIMIT 1").getResultList();
        Object[] b = branch.isEmpty() ? new Object[2] : branch.get(0);
        return new QuoteConfig(cfg.quoteValidityDays(), cfg.quoteTerms(), cfg.pricesIncludeTax(),
                cfg.maxDiscountPercent(), businessName, (String) b[0], (String) b[1]);
    }

    @Transactional(readOnly = true)
    public PageResponse<QuoteRow> list(Filter filter, String search, int page, int size) {
        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE);
        Filter f = filter == null ? Filter.OPEN : filter;
        String where = """
                (:anyStatus OR q.status = :status)
                AND (NOT :validOnly OR q.valid_until >= :today)
                AND (NOT :expiredOnly OR q.valid_until < :today)
                AND (:noSearch OR lower(%s) LIKE :pattern OR p.document_number LIKE :pattern
                     OR q.prospect_phone LIKE :pattern OR CAST(q.number AS text) = :numberText)
                """.formatted(PARTY_NAME);
        Query count = em.createNativeQuery(
                "SELECT count(*) FROM quotes q LEFT JOIN parties p ON p.id = q.customer_id WHERE " + where);
        bind(count, f, search);
        long total = Rows.lng(count.getSingleResult());

        Query query = em.createNativeQuery("""
                SELECT q.id, q.prefix || '-' || q.number, q.status, q.customer_id, %s, q.valid_until, q.total,
                       (SELECT count(*) FROM quote_items i WHERE i.quote_id = q.id), q.converted_type, %s,
                       q.created_at
                FROM quotes q LEFT JOIN parties p ON p.id = q.customer_id
                WHERE %s
                ORDER BY q.created_at DESC, q.id
                LIMIT :size OFFSET :offset
                """.formatted(PARTY_NAME, CONVERTED_NUMBER, where));
        bind(query, f, search);
        query.setParameter("size", safeSize);
        query.setParameter("offset", (long) safePage * safeSize);
        LocalDate today = today();
        List<QuoteRow> rows = new ArrayList<>();
        for (Object row : query.getResultList()) {
            Object[] r = (Object[]) row;
            QuoteStatus status = QuoteStatus.valueOf(Rows.str(r[2]));
            LocalDate validUntil = Rows.date(r[5]);
            rows.add(new QuoteRow(Rows.uuid(r[0]), Rows.str(r[1]), status,
                    status == QuoteStatus.OPEN && validUntil.isBefore(today), Rows.uuid(r[3]), Rows.str(r[4]),
                    validUntil, Rows.decimal(r[6]), Rows.lng(r[7]),
                    r[8] == null ? null : QuoteConversion.valueOf(Rows.str(r[8])), Rows.str(r[9]),
                    Rows.instant(r[10])));
        }
        int pages = (int) Math.ceil(total / (double) safeSize);
        return new PageResponse<>(rows, safePage, safeSize, total, pages);
    }

    @Transactional(readOnly = true)
    public QuoteView view(UUID quoteId) {
        Query header = em.createNativeQuery("""
                SELECT q.id, q.prefix || '-' || q.number, q.status, q.customer_id,
                       CASE WHEN p.person_type = 'LEGAL' THEN p.business_name
                            ELSE trim(p.first_names || ' ' || p.last_names) END,
                       p.document_type, p.document_number, p.verification_digit, p.phone, q.prospect_name,
                       q.prospect_phone, q.valid_until, q.notes, q.terms, q.total, q.created_by, q.created_at,
                       q.converted_type, q.converted_id, %s, q.converted_at, q.rejected_at, q.reject_reason
                FROM quotes q LEFT JOIN parties p ON p.id = q.customer_id
                WHERE q.id = :id
                """.formatted(CONVERTED_NUMBER));
        header.setParameter("id", quoteId);
        List<?> found = header.getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Cotización no encontrada.");
        }
        Object[] h = (Object[]) found.getFirst();

        Query itemQuery = em.createNativeQuery("""
                SELECT i.id, i.line_no, i.product_id, pr.sku, pr.name, u.code, i.description, i.width, i.length,
                       i.quantity, i.unit_price, i.discount_percent, i.total
                FROM quote_items i
                JOIN products pr ON pr.id = i.product_id
                JOIN units u ON u.id = pr.base_unit_id
                WHERE i.quote_id = :id
                ORDER BY i.line_no
                """);
        itemQuery.setParameter("id", quoteId);
        List<ItemView> items = new ArrayList<>();
        for (Object row : itemQuery.getResultList()) {
            Object[] r = (Object[]) row;
            items.add(new ItemView(Rows.uuid(r[0]), (int) Rows.lng(r[1]), Rows.uuid(r[2]), Rows.str(r[3]),
                    Rows.str(r[4]), Rows.str(r[5]), Rows.str(r[6]), r[7] == null ? null : Rows.decimal(r[7]),
                    r[8] == null ? null : Rows.decimal(r[8]), Rows.decimal(r[9]), Rows.decimal(r[10]),
                    Rows.decimal(r[11]), Rows.decimal(r[12])));
        }

        Map<UUID, String> names = members.displayNames(Set.of(Rows.uuid(h[15])));
        QuoteStatus status = QuoteStatus.valueOf(Rows.str(h[2]));
        LocalDate validUntil = Rows.date(h[11]);
        String document = null;
        if (h[3] != null) {
            String documentType = Rows.str(h[5]);
            String number = "NIT".equals(documentType) && h[7] != null ? h[6] + "-" + h[7] : Rows.str(h[6]);
            document = documentType + " " + number;
        }
        return new QuoteView(Rows.uuid(h[0]), Rows.str(h[1]), status,
                status == QuoteStatus.OPEN && validUntil.isBefore(today()), Rows.uuid(h[3]), Rows.str(h[4]),
                document, Rows.str(h[8]), Rows.str(h[9]), Rows.str(h[10]), validUntil, Rows.str(h[12]),
                Rows.str(h[13]), Rows.decimal(h[14]), names.get(Rows.uuid(h[15])), Rows.instant(h[16]),
                h[17] == null ? null : QuoteConversion.valueOf(Rows.str(h[17])), Rows.uuid(h[18]), Rows.str(h[19]),
                Rows.instant(h[20]), Rows.instant(h[21]), Rows.str(h[22]), items);
    }

    private void bind(Query query, Filter filter, String search) {
        boolean anyStatus = filter == Filter.ALL;
        boolean openish = filter == Filter.OPEN || filter == Filter.EXPIRED;
        query.setParameter("anyStatus", anyStatus);
        query.setParameter("status", openish ? QuoteStatus.OPEN.name() : anyStatus ? "OPEN" : filter.name());
        query.setParameter("validOnly", filter == Filter.OPEN);
        query.setParameter("expiredOnly", filter == Filter.EXPIRED);
        query.setParameter("today", today());
        boolean noSearch = search == null || search.isBlank();
        String term = noSearch ? "" : search.trim().toLowerCase(Locale.ROOT);
        query.setParameter("noSearch", noSearch);
        query.setParameter("pattern", noSearch ? "" : "%" + escape(term) + "%");
        query.setParameter("numberText", term.replaceFirst("^cot-?", ""));
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
