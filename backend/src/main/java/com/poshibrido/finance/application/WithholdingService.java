package com.poshibrido.finance.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.parties.application.CustomerApi;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.csv.CsvWriter;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Retenciones (Finanzas parte B, decisión 322): validación al cobrar, retenciones habituales de cada cliente, reporte
 * por periodo y por cliente, y el "certificado recibido".
 * <p>
 * Una retención anulada no se guarda como estado: es la de una venta anulada. La de un abono de pedido cancelado se
 * reversa con una fila negativa (lo retenido se reversa antes que devolver plata: esa parte nunca entró).
 */
@Service
@RequiredArgsConstructor
public class WithholdingService implements WithholdingApi {

    public static final String MANAGE = "finance:manage";
    static final List<String> TYPES = List.of("RETEFUENTE", "RETEICA", "RETEIVA");
    static final int MAX_EXPORT_ROWS = 20_000;
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private static final String ROWS = """
            SELECT w.id, CAST(w.created_at AT TIME ZONE :zone AS date) AS day,
                   w.customer_id,
                   coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, ''))),
                   p.document_type, p.document_number, p.verification_digit,
                   w.type, w.kind, w.base, w.rate, w.amount,
                   CASE WHEN w.sale_id IS NOT NULL THEN s.prefix || '-' || s.number END,
                   CASE WHEN w.order_id IS NOT NULL THEN o.prefix || '-' || o.number END,
                   coalesce(s.status = 'VOIDED', false) AS voided,
                   w.certificate_received, w.certificate_note, w.certificate_at, w.created_by, w.created_at,
                   w.sale_id, w.order_id
            FROM withholdings w
            JOIN parties p ON p.id = w.customer_id
            LEFT JOIN sales s ON s.id = w.sale_id
            LEFT JOIN orders o ON o.id = w.order_id
            """;

    @PersistenceContext
    private EntityManager em;

    private final BusinessSettingsApi settings;
    private final MemberDirectory members;
    private final AuditLogger audit;

    // ------------------------------------------------------------------ vistas

    /** Retención habitual de un cliente. */
    public record CustomerWithholding(String type, BigDecimal rate) {
    }

    /**
     * Una retención del reporte. {@code origin}: "Venta POS-12" o "Pedido PED-3"; {@code voided}: de una venta
     * anulada (no suma); {@code reversal}: reversa de un abono de pedido cancelado (negativa).
     */
    public record WithholdingView(UUID id, LocalDate date, UUID customerId, String customerName, String customerDocument,
                                  String type, BigDecimal base, BigDecimal rate, BigDecimal amount, String origin,
                                  UUID saleId, UUID orderId, boolean reversal, boolean voided,
                                  boolean certificateReceived, String certificateNote, Instant certificateAt,
                                  String createdByName, Instant createdAt) {
    }

    public record TypeTotal(String type, BigDecimal total, long count) {
    }

    /** Por cliente: lo retenido en el periodo y cuántas retenciones esperan certificado. */
    public record CustomerTotal(UUID customerId, String name, String document, BigDecimal total, long count,
                                long pendingCertificates, BigDecimal pendingTotal) {
    }

    public record Summary(LocalDate from, LocalDate to, BigDecimal total, long count, long pendingCertificates,
                          BigDecimal pendingTotal, List<TypeTotal> byType, List<CustomerTotal> byCustomer) {
    }

    /** {@code certificate}: PENDING o RECEIVED (o nulo = todas). */
    public record Filter(LocalDate from, LocalDate to, UUID customerId, String type, String certificate,
                         boolean includeVoided) {
    }

    // ------------------------------------------------------------------ al cobrar (WithholdingApi)

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Line> check(UUID customerId, Bases bases, List<Line> lines, BigDecimal lineAmount) {
        if (lines == null || lines.isEmpty()) {
            throw new BusinessRuleException("Falta el detalle de la retención: tipo, base y tarifa.");
        }
        if (lines.size() > TYPES.size()) {
            throw new BusinessRuleException("Máximo una retención de cada tipo por pago.");
        }
        if (customerId == null || CustomerApi.FINAL_CONSUMER_ID.equals(customerId)) {
            throw new BusinessRuleException("Elige el cliente: la retención queda a su nombre y él da el certificado.");
        }
        boolean manager = CurrentActor.permissions().contains(MANAGE);
        Map<String, BigDecimal> usual = manager ? Map.of() : usualRates(customerId);
        Set<String> seen = new HashSet<>();
        List<Line> result = new ArrayList<>();
        BigDecimal sum = BigDecimal.ZERO;
        for (Line l : lines) {
            String type = type(l == null ? null : l.type());
            if (!seen.add(type)) {
                throw new BusinessRuleException("Hay dos retenciones del mismo tipo: júntalas en una.");
            }
            BigDecimal suggestedBase = money("RETEIVA".equals(type) ? bases.iva() : bases.base());
            Line checked;
            if (manager) {
                checked = free(type, l, suggestedBase, bases);
            } else {
                BigDecimal rate = usual.get(type);
                if (rate == null) {
                    throw new ForbiddenException("Este cliente no tiene " + label(type) + " en su ficha. Pídele a quien "
                            + "maneje las finanzas que la agregue, o que registre él este cobro.");
                }
                checked = usual(type, rate, suggestedBase, l.amount());
            }
            result.add(checked);
            sum = sum.add(checked.amount());
        }
        if (lineAmount != null && sum.compareTo(lineAmount.setScale(2, RoundingMode.HALF_UP)) != 0) {
            throw new BusinessRuleException("La línea de Retención ($ " + pesos(lineAmount)
                    + ") no coincide con la suma del detalle ($ " + pesos(sum) + ").");
        }
        return result;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public List<Line> checkOnPayment(UUID customerId, java.util.function.Function<BigDecimal, Bases> basesOf,
                                     BigDecimal paid, List<Line> lines) {
        if (lines == null || lines.isEmpty()) {
            throw new BusinessRuleException("Falta el detalle de la retención: tipo, base y tarifa.");
        }
        boolean manager = CurrentActor.permissions().contains(MANAGE);
        Map<String, BigDecimal> usual = manager || customerId == null ? Map.of() : usualRates(customerId);
        // Abono completo = pagado + retenido, y lo retenido depende del abono completo: se despeja por aproximaciones
        // (las tarifas son pequeñas, en pocas vueltas queda fijo al peso).
        BigDecimal gross = money(paid);
        for (int round = 0; round < 25; round++) {
            Bases b = basesOf.apply(gross);
            BigDecimal sum = money(paid);
            for (Line l : lines) {
                if (l == null || l.type() == null || !TYPES.contains(l.type().trim().toUpperCase(Locale.ROOT))) {
                    continue;
                }
                String type = l.type().trim().toUpperCase(Locale.ROOT);
                if (manager && l.amount() != null) {
                    sum = sum.add(money(l.amount()));
                    continue;
                }
                BigDecimal rate = manager ? l.rate() : usual.get(type);
                if (rate == null || rate.signum() <= 0) {
                    continue;
                }
                BigDecimal base = manager && l.base() != null ? money(l.base())
                        : money("RETEIVA".equals(type) ? b.iva() : b.base());
                sum = sum.add(compute(base, rate));
            }
            if (sum.compareTo(gross) == 0) {
                break;
            }
            gross = sum;
        }
        return check(customerId, basesOf.apply(gross), lines, null);
    }

    /** Con el permiso de finanzas: tipo, base y tarifa libres; el valor se calcula si no viene. */
    private static Line free(String type, Line l, BigDecimal suggestedBase, Bases bases) {
        BigDecimal base = l.base() == null ? suggestedBase : money(l.base());
        if (base.signum() <= 0) {
            throw new BusinessRuleException("RETEIVA".equals(type) ? "Este cobro no tiene IVA: no hay reteIVA."
                    : "La base de la " + label(type) + " debe ser mayor que cero.");
        }
        BigDecimal ceiling = money(bases.base()).add(money(bases.iva()));
        if (base.compareTo(ceiling) > 0) {
            throw new BusinessRuleException("La base de la " + label(type) + " no puede pasar de lo que se cobra ($ "
                    + pesos(ceiling) + ").");
        }
        BigDecimal rate = l.rate() == null ? null : l.rate().setScale(4, RoundingMode.HALF_UP);
        if (rate != null && (rate.signum() <= 0 || rate.compareTo(HUNDRED) > 0)) {
            throw new BusinessRuleException("La tarifa de la " + label(type) + " va de 0 a 100 %.");
        }
        BigDecimal amount = l.amount() != null ? l.amount() : rate == null ? null : compute(base, rate);
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("Escribe la tarifa o el valor de la " + label(type) + ".");
        }
        if (amount.stripTrailingZeros().scale() > 0) {
            throw new BusinessRuleException("La retención va en pesos, sin centavos.");
        }
        if (amount.compareTo(base) > 0) {
            throw new BusinessRuleException("La " + label(type) + " no puede ser mayor que su base.");
        }
        return new Line(type, base, rate, money(amount));
    }

    /** Sin el permiso de finanzas: la tarifa de la ficha sobre la base que calcula XASKA (un peso de margen). */
    private static Line usual(String type, BigDecimal rate, BigDecimal base, BigDecimal given) {
        if (base.signum() <= 0) {
            throw new BusinessRuleException("RETEIVA".equals(type) ? "Este cobro no tiene IVA: no hay reteIVA."
                    : "No hay base para la " + label(type) + ".");
        }
        BigDecimal expected = compute(base, rate);
        if (given != null && given.subtract(expected).abs().compareTo(BigDecimal.ONE) > 0) {
            throw new BusinessRuleException("La " + label(type) + " de este cliente es " + rate.stripTrailingZeros()
                    .toPlainString() + " % de $ " + pesos(base) + ": $ " + pesos(expected) + ". Revisa el valor.");
        }
        return new Line(type, base, rate, money(given == null ? expected : given));
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordForSale(UUID saleId, int paymentLineNo, UUID customerId, List<Line> lines) {
        for (Line l : lines) {
            insert(customerId, l, saleId, paymentLineNo, null, null);
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordForOrderPayment(UUID orderId, UUID orderPaymentId, UUID customerId, List<Line> lines) {
        for (Line l : lines) {
            insert(customerId, l, null, null, orderId, orderPaymentId);
        }
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public BigDecimal orderWithheld(UUID orderId) {
        Object total = em.createNativeQuery("SELECT coalesce(sum(amount), 0) FROM withholdings WHERE order_id = ?1")
                .setParameter(1, orderId).getSingleResult();
        return money(total);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void reverseForOrder(UUID orderId, UUID refundPaymentId, BigDecimal amount) {
        BigDecimal pending = money(amount);
        if (pending.signum() <= 0) {
            return;
        }
        // Lo que queda de cada retención (lo retenido menos sus reversas), de la más nueva a la más vieja.
        List<?> rows = em.createNativeQuery("""
                SELECT w.id, w.customer_id, w.type, w.base, w.rate,
                       w.amount + coalesce((SELECT sum(r.amount) FROM withholdings r WHERE r.reverses_id = w.id), 0)
                FROM withholdings w WHERE w.order_id = ?1 AND w.kind = 'WITHHELD' ORDER BY w.created_at DESC, w.id""")
                .setParameter(1, orderId).getResultList();
        for (Object row : rows) {
            if (pending.signum() <= 0) {
                break;
            }
            Object[] r = (Object[]) row;
            BigDecimal left = money(r[5]);
            if (left.signum() <= 0) {
                continue;
            }
            BigDecimal take = left.min(pending);
            em.createNativeQuery("""
                    INSERT INTO withholdings (id, customer_id, type, kind, base, rate, amount, order_id, order_payment_id,
                        reverses_id, created_by, created_at)
                    VALUES (?1, ?2, ?3, 'REVERSAL', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)""")
                    .setParameter(1, Ids.newId()).setParameter(2, r[1]).setParameter(3, r[2]).setParameter(4, r[3])
                    .setParameter(5, r[4]).setParameter(6, take.negate()).setParameter(7, orderId)
                    .setParameter(8, refundPaymentId).setParameter(9, r[0])
                    .setParameter(10, CurrentActor.requireUserId()).setParameter(11, Timestamp.from(Instant.now()))
                    .executeUpdate();
            pending = pending.subtract(take);
        }
    }

    private void insert(UUID customerId, Line l, UUID saleId, Integer lineNo, UUID orderId, UUID orderPaymentId) {
        em.createNativeQuery("""
                INSERT INTO withholdings (id, customer_id, type, base, rate, amount, sale_id, payment_line_no, order_id,
                    order_payment_id, created_by, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)""")
                .setParameter(1, Ids.newId()).setParameter(2, customerId).setParameter(3, l.type())
                .setParameter(4, l.base()).setParameter(5, l.rate()).setParameter(6, l.amount())
                .setParameter(7, saleId).setParameter(8, lineNo).setParameter(9, orderId)
                .setParameter(10, orderPaymentId).setParameter(11, CurrentActor.requireUserId())
                .setParameter(12, Timestamp.from(Instant.now())).executeUpdate();
    }

    // ------------------------------------------------------------------ retenciones habituales del cliente

    @Transactional(readOnly = true)
    public List<CustomerWithholding> usual(UUID customerId) {
        List<CustomerWithholding> result = new ArrayList<>();
        usualRates(customerId).forEach((type, rate) -> result.add(new CustomerWithholding(type, rate)));
        return result;
    }

    /** Reemplaza las retenciones habituales del cliente (lista vacía = ninguna). */
    @Transactional
    public List<CustomerWithholding> setUsual(UUID customerId, List<CustomerWithholding> wanted) {
        if (customerId == null || CustomerApi.FINAL_CONSUMER_ID.equals(customerId)) {
            throw new BusinessRuleException("El consumidor final no hace retenciones.");
        }
        if (em.createNativeQuery("SELECT 1 FROM customers WHERE party_id = ?1").setParameter(1, customerId)
                .getResultList().isEmpty()) {
            throw new NotFoundException("Cliente no encontrado.");
        }
        Map<String, BigDecimal> clean = new LinkedHashMap<>();
        for (CustomerWithholding w : wanted == null ? List.<CustomerWithholding>of() : wanted) {
            String type = type(w == null ? null : w.type());
            BigDecimal rate = w.rate() == null ? null : w.rate().setScale(4, RoundingMode.HALF_UP);
            if (rate == null || rate.signum() <= 0 || rate.compareTo(HUNDRED) > 0) {
                throw new BusinessRuleException("La tarifa de la " + label(type) + " va de 0 a 100 %.");
            }
            if (clean.put(type, rate) != null) {
                throw new BusinessRuleException("Hay dos retenciones del mismo tipo.");
            }
        }
        Map<String, BigDecimal> before = usualRates(customerId);
        em.createNativeQuery("DELETE FROM customer_withholdings WHERE customer_id = ?1").setParameter(1, customerId)
                .executeUpdate();
        Timestamp now = Timestamp.from(Instant.now());
        UUID actor = CurrentActor.requireUserId();
        clean.forEach((type, rate) -> em.createNativeQuery("""
                INSERT INTO customer_withholdings (customer_id, type, rate, updated_by, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5)""")
                .setParameter(1, customerId).setParameter(2, type).setParameter(3, rate).setParameter(4, actor)
                .setParameter(5, now).executeUpdate());
        Map<String, Object> b = new LinkedHashMap<>(before);
        Map<String, Object> a = new LinkedHashMap<>(clean);
        audit.log("CUSTOMER_WITHHOLDINGS_UPDATED", "customer", customerId, b, a);
        return usual(customerId);
    }

    private Map<String, BigDecimal> usualRates(UUID customerId) {
        Map<String, BigDecimal> result = new LinkedHashMap<>();
        for (Object row : em.createNativeQuery("""
                SELECT type, rate FROM customer_withholdings WHERE customer_id = ?1
                ORDER BY CASE type WHEN 'RETEFUENTE' THEN 1 WHEN 'RETEICA' THEN 2 ELSE 3 END""")
                .setParameter(1, customerId).getResultList()) {
            Object[] r = (Object[]) row;
            result.put((String) r[0], ((BigDecimal) r[1]).setScale(4, RoundingMode.HALF_UP));
        }
        return result;
    }

    // ------------------------------------------------------------------ reporte

    @Transactional(readOnly = true)
    public PageResponse<WithholdingView> list(Filter f, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 100);
        Filter filter = normalize(f);
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, true);
        long total = ((Number) query("SELECT count(*) FROM (" + ROWS + where + ") x", params).getSingleResult())
                .longValue();
        List<WithholdingView> rows = views(query(ROWS + where + " ORDER BY w.created_at DESC, w.id", params)
                .setFirstResult(p * s).setMaxResults(s).getResultList());
        return new PageResponse<>(rows, p, s, total, (int) Math.ceil(total / (double) s));
    }

    /** Totales del filtro sin las anuladas: por tipo y por cliente, con lo que espera certificado. */
    @Transactional(readOnly = true)
    public Summary summary(Filter f) {
        Filter filter = normalize(new Filter(f.from(), f.to(), f.customerId(), f.type(), f.certificate(), false));
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, false);
        String pendingCase = "w.kind = 'WITHHELD' AND NOT w.certificate_received";
        Object[] t = (Object[]) query("""
                SELECT coalesce(sum(w.amount), 0), count(*) FILTER (WHERE w.kind = 'WITHHELD'),
                       count(*) FILTER (WHERE %1$s), coalesce(sum(w.amount) FILTER (WHERE %1$s), 0)
                FROM withholdings w LEFT JOIN sales s ON s.id = w.sale_id""".formatted(pendingCase) + where, params)
                .getSingleResult();
        List<TypeTotal> byType = new ArrayList<>();
        for (Object row : query("""
                SELECT w.type, sum(w.amount), count(*) FILTER (WHERE w.kind = 'WITHHELD')
                FROM withholdings w LEFT JOIN sales s ON s.id = w.sale_id""" + where
                + " GROUP BY w.type ORDER BY CASE w.type WHEN 'RETEFUENTE' THEN 1 WHEN 'RETEICA' THEN 2 ELSE 3 END",
                params).getResultList()) {
            Object[] r = (Object[]) row;
            byType.add(new TypeTotal((String) r[0], money(r[1]), ((Number) r[2]).longValue()));
        }
        List<CustomerTotal> byCustomer = new ArrayList<>();
        for (Object row : query("""
                SELECT w.customer_id,
                       coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, ''))),
                       p.document_type, p.document_number, p.verification_digit, sum(w.amount),
                       count(*) FILTER (WHERE w.kind = 'WITHHELD'), count(*) FILTER (WHERE %1$s),
                       coalesce(sum(w.amount) FILTER (WHERE %1$s), 0)
                FROM withholdings w JOIN parties p ON p.id = w.customer_id LEFT JOIN sales s ON s.id = w.sale_id"""
                .formatted(pendingCase) + where + """
                 GROUP BY w.customer_id, p.business_name, p.first_names, p.last_names, p.document_type,
                          p.document_number, p.verification_digit
                 ORDER BY sum(w.amount) DESC""", params).getResultList()) {
            Object[] r = (Object[]) row;
            byCustomer.add(new CustomerTotal((UUID) r[0], (String) r[1], document(r[2], r[3], r[4]), money(r[5]),
                    ((Number) r[6]).longValue(), ((Number) r[7]).longValue(), money(r[8])));
        }
        return new Summary(filter.from(), filter.to(), money(t[0]), ((Number) t[1]).longValue(),
                ((Number) t[2]).longValue(), money(t[3]), byType, byCustomer);
    }

    @Transactional(readOnly = true)
    public CsvWriter csv(Filter f) {
        Filter filter = normalize(f);
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, true);
        List<WithholdingView> rows = views(query(ROWS + where + " ORDER BY w.created_at, w.id", params)
                .setMaxResults(MAX_EXPORT_ROWS).getResultList());
        CsvWriter csv = new CsvWriter(zone());
        csv.row("Fecha", "Cliente", "Documento", "Tipo", "Base", "Tarifa %", "Valor", "Origen", "Estado",
                "Certificado", "Nota del certificado", "Registró");
        for (WithholdingView w : rows) {
            csv.row(w.date(), w.customerName(), w.customerDocument(), label(w.type()), w.base(),
                    w.rate() == null ? null : w.rate().stripTrailingZeros().toPlainString(), w.amount(), w.origin(),
                    w.voided() ? "Anulada (venta anulada)" : w.reversal() ? "Reversa" : "Activa",
                    w.reversal() ? null : w.certificateReceived() ? "Recibido" : "Pendiente", w.certificateNote(),
                    w.createdByName());
        }
        return csv;
    }

    /** Marca (o desmarca) el certificado de varias retenciones del mismo cliente o de varios. */
    @Transactional
    public int markCertificate(List<UUID> ids, boolean received, String note) {
        if (ids == null || ids.isEmpty()) {
            throw new BusinessRuleException("Elige las retenciones del certificado.");
        }
        if (ids.size() > 500) {
            throw new BusinessRuleException("Máximo 500 retenciones a la vez.");
        }
        List<?> found = em.createNativeQuery("""
                SELECT w.id FROM withholdings w LEFT JOIN sales s ON s.id = w.sale_id
                WHERE w.id IN (:ids) AND w.kind = 'WITHHELD' AND coalesce(s.status, '') <> 'VOIDED' FOR UPDATE OF w""")
                .setParameter("ids", ids).getResultList();
        if (found.size() != new HashSet<>(ids).size()) {
            throw new BusinessRuleException("Alguna retención no existe, es una reversa o es de una venta anulada.");
        }
        String clean = ExpenseService.clean(note, 255);
        int changed = em.createNativeQuery("""
                UPDATE withholdings SET certificate_received = :received, certificate_note = :note,
                    certificate_by = :by, certificate_at = :at
                WHERE id IN (:ids)""")
                .setParameter("received", received).setParameter("note", received ? clean : null)
                .setParameter("by", received ? CurrentActor.requireUserId() : null)
                .setParameter("at", received ? Timestamp.from(Instant.now()) : null)
                .setParameter("ids", ids).executeUpdate();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("count", changed);
        data.put("received", received);
        if (clean != null && received) {
            data.put("note", clean);
        }
        audit.log(received ? "WITHHOLDING_CERTIFICATE_RECEIVED" : "WITHHOLDING_CERTIFICATE_CLEARED", "withholding",
                ids.size() == 1 ? ids.getFirst() : null, null, data);
        return changed;
    }

    public Filter normalize(Filter f) {
        LocalDate today = LocalDate.now(zone());
        LocalDate from = f.from() == null ? today.withDayOfMonth(1) : f.from();
        LocalDate to = f.to() == null ? (from.isAfter(today) ? from : today) : f.to();
        if (from.isAfter(to)) {
            throw new BusinessRuleException("La fecha inicial no puede ser posterior a la final.");
        }
        String type = f.type() == null || f.type().isBlank() ? null : type(f.type());
        String certificate = f.certificate() == null || f.certificate().isBlank() ? null
                : f.certificate().trim().toUpperCase(Locale.ROOT);
        if (certificate != null && !certificate.equals("PENDING") && !certificate.equals("RECEIVED")) {
            throw new BusinessRuleException("Certificado: usa PENDING o RECEIVED.");
        }
        return new Filter(from, to, f.customerId(), type, certificate, f.includeVoided());
    }

    private String where(Filter f, Map<String, Object> params, boolean allowVoided) {
        StringBuilder where = new StringBuilder(
                " WHERE w.created_at >= :fromTs AND w.created_at < :toTs");
        params.put("zone", zone().getId());
        params.put("fromTs", Timestamp.from(f.from().atStartOfDay(zone()).toInstant()));
        params.put("toTs", Timestamp.from(f.to().plusDays(1).atStartOfDay(zone()).toInstant()));
        if (!allowVoided || !f.includeVoided()) {
            where.append(" AND coalesce(s.status, '') <> 'VOIDED'");
        }
        if (f.customerId() != null) {
            where.append(" AND w.customer_id = :customer");
            params.put("customer", f.customerId());
        }
        if (f.type() != null) {
            where.append(" AND w.type = :type");
            params.put("type", f.type());
        }
        if ("PENDING".equals(f.certificate())) {
            where.append(" AND w.kind = 'WITHHELD' AND NOT w.certificate_received");
        } else if ("RECEIVED".equals(f.certificate())) {
            where.append(" AND w.certificate_received");
        }
        return where.toString();
    }

    private List<WithholdingView> views(List<?> rows) {
        Set<UUID> people = new HashSet<>();
        for (Object row : rows) {
            people.add((UUID) ((Object[]) row)[18]);
        }
        Map<UUID, String> names = members.displayNames(people);
        List<WithholdingView> result = new ArrayList<>(rows.size());
        for (Object row : rows) {
            Object[] r = (Object[]) row;
            String origin = r[12] != null ? "Venta " + r[12] : "Pedido " + r[13];
            result.add(new WithholdingView((UUID) r[0], toDate(r[1]), (UUID) r[2], (String) r[3],
                    document(r[4], r[5], r[6]), (String) r[7], money(r[9]),
                    r[10] == null ? null : ((BigDecimal) r[10]).setScale(4, RoundingMode.HALF_UP), money(r[11]),
                    origin, (UUID) r[20], (UUID) r[21], "REVERSAL".equals(r[8]), Boolean.TRUE.equals(r[14]),
                    Boolean.TRUE.equals(r[15]), (String) r[16], instant(r[17]), names.get((UUID) r[18]),
                    instant(r[19])));
        }
        return result;
    }

    // ------------------------------------------------------------------ apoyo

    static String type(String raw) {
        String t = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!TYPES.contains(t)) {
            throw new BusinessRuleException("Tipo de retención inválido: usa retefuente, reteICA o reteIVA.");
        }
        return t;
    }

    static String label(String type) {
        return switch (type) {
            case "RETEFUENTE" -> "retención en la fuente";
            case "RETEICA" -> "reteICA";
            case "RETEIVA" -> "reteIVA";
            default -> type;
        };
    }

    /** Valor redondeado al peso. */
    static BigDecimal compute(BigDecimal base, BigDecimal rate) {
        return base.multiply(rate).divide(HUNDRED, 0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
    }

    private static String document(Object type, Object number, Object dv) {
        if (number == null) {
            return null;
        }
        return type + " " + number + (dv == null ? "" : "-" + dv);
    }

    private static String pesos(BigDecimal value) {
        return String.format(Locale.forLanguageTag("es-CO"), "%,d",
                value.setScale(0, RoundingMode.HALF_UP).longValueExact());
    }

    private Query query(String sql, Map<String, Object> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach((k, v) -> {
            if (sql.contains(":" + k)) {
                q.setParameter(k, v);
            }
        });
        return q;
    }

    private ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    private static BigDecimal money(Object value) {
        if (value == null) {
            return BigDecimal.ZERO.setScale(2);
        }
        return (value instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(value))).setScale(2,
                RoundingMode.HALF_UP);
    }

    private static LocalDate toDate(Object value) {
        return value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }

    private static Instant instant(Object value) {
        return value == null ? null : value instanceof Timestamp t ? t.toInstant() : (Instant) value;
    }
}
