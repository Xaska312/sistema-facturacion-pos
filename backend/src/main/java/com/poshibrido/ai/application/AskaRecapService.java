package com.poshibrido.ai.application;

import com.poshibrido.finance.application.IncomeStatementService;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.reporting.application.ReportQueryService;
import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Locale;
import java.util.Map;

/**
 * "Lo que hiciste con Aska" (decisión 309): lo que XASKA IA hizo por el negocio en un periodo (facturas leídas y sus
 * líneas, productos de listas y cuadernos, preguntas, pedidos revisados, resúmenes del día) y el tiempo que eso le
 * ahorró, estimado con supuestos a la vista. Va por correo al dueño el día 1 de cada mes (el mes anterior) y 2 días
 * antes de que termine la prueba gratis (lo de la prueba), una sola vez cada uno; y en Inicio los primeros 7 días del
 * mes. No usa la IA: son conteos de lo que ya quedó registrado.
 * <p>Decisión 325: cuenta también los recibos de gastos leídos, y el correo del mes trae cómo le fue al negocio (ventas,
 * gastos, ganancia y los gastos más grandes del estado de resultados), aunque Aska no haya hecho nada ese mes.
 */
@Service
public class AskaRecapService {

    /** Supuestos del tiempo ahorrado: lo que tardaría hacerlo a mano. */
    static final int SECONDS_PER_INVOICE_LINE = 30;
    static final int SECONDS_PER_PRODUCT = 60;
    static final int SECONDS_PER_QUESTION = 5 * 60;
    static final int SECONDS_PER_REVIEW = 10 * 60;
    static final int SECONDS_PER_DIGEST = 10 * 60;
    static final int SECONDS_PER_RECEIPT = 2 * 60;
    /** La tarjeta de Inicio se ve los primeros días del mes. */
    static final int CARD_DAYS = 7;
    /** El correo de la prueba sale cuando le quedan 2 días o menos. */
    static final Duration TRIAL_NOTICE = Duration.ofDays(2);
    static final String TRIAL = "TRIAL";

    public record Recap(String title, LocalDate from, LocalDate to, int invoices, int invoiceLines, int products,
                        int questions, int reviews, int digests, int minutesSaved, String savedLabel, int receipts) {

        public Recap(String title, LocalDate from, LocalDate to, int invoices, int invoiceLines, int products,
                     int questions, int reviews, int digests, int minutesSaved, String savedLabel) {
            this(title, from, to, invoices, invoiceLines, products, questions, reviews, digests, minutesSaved,
                    savedLabel, 0);
        }

        public boolean empty() {
            return invoices + products + questions + reviews + digests + receipts == 0;
        }
    }

    private final ReportQueryService reports;
    private final IncomeStatementService incomeStatement;
    private final SubscriptionApi subscriptions;
    private final TenantApi tenants;
    private final UserApi users;
    private final MailTemplates templates;
    private final Mailer mailer;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    public AskaRecapService(ReportQueryService reports, IncomeStatementService incomeStatement, SubscriptionApi subscriptions, TenantApi tenants, UserApi users,
                            MailTemplates templates, Mailer mailer, PlatformTransactionManager transactions) {
        this.reports = reports;
        this.incomeStatement = incomeStatement;
        this.subscriptions = subscriptions;
        this.tenants = tenants;
        this.users = users;
        this.templates = templates;
        this.mailer = mailer;
        this.tx = new TransactionTemplate(transactions);
    }

    /** El mes anterior, para la tarjeta de Inicio (solo los primeros 7 días del mes y si hubo algo). */
    public Recap forHome() {
        ZoneId zone = reports.zone();
        LocalDate today = LocalDate.now(zone);
        if (today.getDayOfMonth() > CARD_DAYS) {
            return null;
        }
        Recap r = month(YearMonth.from(today).minusMonths(1));
        return r.empty() ? null : r;
    }

    public Recap month(YearMonth month) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();
        String name = month.getMonth().getDisplayName(TextStyle.FULL, Locale.forLanguageTag("es-CO"));
        return compute("Tu " + name + " con Aska", from, to);
    }

    /** Lo de los últimos 30 días (la prueba dura 14: todo lo que hizo en ella). */
    Recap trial() {
        LocalDate today = LocalDate.now(reports.zone());
        return compute("Tu prueba de XASKA IA", today.minusDays(30), today);
    }

    Recap compute(String title, LocalDate from, LocalDate to) {
        ZoneId zone = reports.zone();
        Timestamp start = Timestamp.from(from.atStartOfDay(zone).toInstant());
        Timestamp end = Timestamp.from(to.plusDays(1).atStartOfDay(zone).toInstant());
        Object[] scans = (Object[]) em.createNativeQuery("""
                SELECT count(DISTINCT s.id),
                       (SELECT count(*) FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id = l.receipt_id
                        WHERE r.document_id IN (SELECT x.document_id FROM purchase_invoice_scans x
                                                WHERE x.status = 'OK' AND x.created_at >= ?1 AND x.created_at < ?2))
                FROM purchase_invoice_scans s WHERE s.status = 'OK' AND s.created_at >= ?1 AND s.created_at < ?2""")
                .setParameter(1, start).setParameter(2, end).getSingleResult();
        Object[] asks = (Object[]) em.createNativeQuery("""
                SELECT count(*) FILTER (WHERE kind = 'QUESTION'), count(*) FILTER (WHERE kind = 'PURCHASE_REVIEW'),
                       coalesce(sum(items) FILTER (WHERE kind = 'CATALOG_READ'), 0),
                       count(*) FILTER (WHERE kind = 'EXPENSE_READ')
                FROM ai_questions WHERE status = 'OK' AND created_at >= ?1 AND created_at < ?2""")
                .setParameter(1, start).setParameter(2, end).getSingleResult();
        long digests = ((Number) em.createNativeQuery("""
                SELECT count(*) FROM daily_digests WHERE status = 'OK' AND digest_date BETWEEN ?1 AND ?2""")
                .setParameter(1, Date.valueOf(from)).setParameter(2, Date.valueOf(to)).getSingleResult()).longValue();
        int invoices = n(scans[0]);
        int lines = n(scans[1]);
        int questions = n(asks[0]);
        int reviews = n(asks[1]);
        int products = n(asks[2]);
        int receipts = n(asks[3]);
        int minutes = minutesSaved(lines, products, questions, reviews, (int) digests, receipts);
        return new Recap(title, from, to, invoices, lines, products, questions, reviews, (int) digests, minutes,
                savedLabel(minutes), receipts);
    }

    static int minutesSaved(int lines, int products, int questions, int reviews, int digests) {
        return minutesSaved(lines, products, questions, reviews, digests, 0);
    }

    static int minutesSaved(int lines, int products, int questions, int reviews, int digests, int receipts) {
        long seconds = (long) receipts * SECONDS_PER_RECEIPT
                + (long) lines * SECONDS_PER_INVOICE_LINE + (long) products * SECONDS_PER_PRODUCT
                + (long) questions * SECONDS_PER_QUESTION + (long) reviews * SECONDS_PER_REVIEW
                + (long) digests * SECONDS_PER_DIGEST;
        return (int) Math.round(seconds / 60.0);
    }

    /** "cerca de 45 minutos", "cerca de 1 hora", "cerca de 6,5 horas" (a la media hora). */
    static String savedLabel(int minutes) {
        if (minutes < 60) {
            return minutes <= 1 ? "un par de minutos" : "cerca de " + minutes + " minutos";
        }
        double hours = Math.round(minutes / 30.0) / 2.0;
        String h = hours == Math.floor(hours) ? String.valueOf((int) hours) : String.valueOf(hours).replace('.', ',');
        return "cerca de " + h + (hours == 1 ? " hora" : " horas");
    }

    // ------------------------------------------------------------------ correos

    /** El día 1 (desde las 8 a. m. del negocio): el mes anterior, si hubo algo. Devuelve si lo envió. */
    public boolean sendMonthlyIfDue() {
        ZoneId zone = reports.zone();
        var now = java.time.ZonedDateTime.now(zone);
        if (now.getDayOfMonth() != 1 || now.getHour() < 8) {
            return false;
        }
        YearMonth last = YearMonth.from(now).minusMonths(1);
        Recap r = month(last);
        MailTemplates.RecapMoney money = money(last);
        if ((r.empty() && money == null) || !reserve(last.toString())) {
            return false;
        }
        return send(r, null, money);
    }

    /** Cómo le fue al negocio ese mes (decisión 325): nulo si no hubo ventas ni gastos. */
    public MailTemplates.RecapMoney money(YearMonth month) {
        IncomeStatementService.Statement st;
        try {
            st = incomeStatement.report(month.atDay(1), month.atEndOfMonth(), null).current();
        } catch (RuntimeException ex) {
            return null;
        }
        return money(st);
    }

    static MailTemplates.RecapMoney money(IncomeStatementService.Statement st) {
        if (st == null || !st.hasData()) {
            return null;
        }
        BigDecimal profit = st.operatingProfit();
        java.util.List<String[]> rows = new java.util.ArrayList<>();
        rows.add(new String[]{"Ventas sin IVA", MailTemplates.money(st.netSales())});
        rows.add(new String[]{"Costo de lo vendido", MailTemplates.money(st.cost())});
        rows.add(new String[]{"Gastos", MailTemplates.money(st.expensesTotal())});
        java.util.List<String[]> top = st.expenses().stream().limit(3)
                .map(l -> new String[]{l.name(), MailTemplates.money(l.amount())}).toList();
        String label = profit.signum() >= 0 ? "Ganaste" : "Perdiste";
        return new MailTemplates.RecapMoney(label, MailTemplates.money(profit.abs()), rows, top);
    }

    /** Cuando a la prueba gratis le quedan 2 días o menos: lo que hizo en ella. Devuelve si lo envió. */
    public boolean sendTrialIfDue() {
        TenantInfo tenant = TenantContext.current().flatMap(t -> tenants.findInfo(t.id())).orElse(null);
        if (tenant == null) {
            return false;
        }
        Instant ends = subscriptions.aiTrialEndsAt(tenant.id());
        if (ends == null || Duration.between(Instant.now(), ends).compareTo(TRIAL_NOTICE) > 0 || !reserve(TRIAL)) {
            return false;
        }
        String endsLabel = DateTimeFormatter.ofPattern("EEEE d 'de' MMMM", Locale.forLanguageTag("es-CO"))
                .format(ends.atZone(reports.zone()));
        return send(trial(), endsLabel, null);
    }

    /** Aparta el envío del periodo; si otro servidor ya lo hizo, no se repite. */
    private boolean reserve(String period) {
        Integer done = tx.execute(s -> em.createNativeQuery("""
                INSERT INTO aska_recaps (period, sent_at) VALUES (?1, ?2) ON CONFLICT (period) DO NOTHING""")
                .setParameter(1, period).setParameter(2, Timestamp.from(Instant.now())).executeUpdate());
        return done != null && done == 1;
    }

    private boolean send(Recap r, String trialEnds, MailTemplates.RecapMoney money) {
        TenantInfo tenant = TenantContext.current().flatMap(t -> tenants.findInfo(t.id())).orElse(null);
        if (tenant == null || tenant.ownerUserId() == null) {
            return false;
        }
        Map<java.util.UUID, UserSummary> people = users.findSummaries(java.util.Set.of(tenant.ownerUserId()));
        UserSummary owner = people.get(tenant.ownerUserId());
        if (owner == null || owner.email() == null) {
            return false;
        }
        mailer.send(templates.askaRecap(owner.email(), owner.fullName(), tenant.tradeName(), r.title(),
                r.empty() ? null : r.savedLabel(), lines(r), trialEnds, money));
        return true;
    }

    /** Lo que se cuenta en el correo, en primera persona de Aska: emoji y frase. Solo lo que pasó. */
    public static java.util.List<String[]> lines(Recap r) {
        java.util.List<String[]> out = new java.util.ArrayList<>();
        if (r.invoices() > 0) {
            out.add(new String[]{"🧾", "Leí " + plural(r.invoices(), "factura", "facturas") + " de tus proveedores"
                    + (r.invoiceLines() > 0 ? ": " + plural(r.invoiceLines(), "línea", "líneas") + " que no digitaste."
                    : ".")});
        }
        if (r.products() > 0) {
            out.add(new String[]{"📦", "Pasé " + plural(r.products(), "producto", "productos")
                    + " de tus listas y cuadernos a XASKA."});
        }
        if (r.questions() > 0) {
            out.add(new String[]{"💬", "Respondí " + plural(r.questions(), "pregunta", "preguntas")
                    + " sobre tu negocio."});
        }
        if (r.reviews() > 0) {
            out.add(new String[]{"🛒", "Revisé " + plural(r.reviews(), "pedido", "pedidos") + " antes de que compraras."});
        }
        if (r.receipts() > 0) {
            out.add(new String[]{"📎", "Leí " + plural(r.receipts(), "recibo", "recibos")
                    + " de tus gastos y llené el formulario por ti."});
        }
        if (r.digests() > 0) {
            out.add(new String[]{"☀️", "Te conté cómo te fue " + plural(r.digests(), "día", "días")
                    + " en el Resumen del día."});
        }
        return out;
    }

    private static String plural(int n, String one, String many) {
        return n + " " + (n == 1 ? one : many);
    }

    private static int n(Object o) {
        return o == null ? 0 : ((Number) o).intValue();
    }
}
