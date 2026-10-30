package com.poshibrido.dining.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.error.BusinessRuleException;
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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Propinas (Fase 12b-5, decisión 272; ley 1935 de 2018): son voluntarias y del equipo de trabajo, no del negocio. Aquí
 * se ve lo recogido en un periodo (máximo un mes) y lo pendiente por repartir, y se registra la entrega en partes
 * iguales entre las personas que elija el dueño; si sale de la caja queda como egreso de propinas.
 */
@Service
@RequiredArgsConstructor
public class TipService {

    static final int MAX_DAYS = 31;
    static final int MAX_PEOPLE = 50;

    private final DiningService dining;
    private final CashApi cash;
    private final BusinessSettingsApi settings;
    private final AuditLogger audit;

    @PersistenceContext
    private EntityManager em;

    public record MethodTotal(String methodName, BigDecimal amount, long count) {
    }

    public record Person(UUID memberId, String name) {
    }

    public record Share(UUID memberId, String name, BigDecimal amount) {
    }

    public record PayoutView(UUID id, long number, LocalDate from, LocalDate to, BigDecimal amount, boolean fromCash,
                             String notes, String createdByName, Instant createdAt, List<Share> shares) {
    }

    /**
     * {@code collected}: propinas del periodo (sin las de ventas anuladas); {@code pending}: todo lo recogido en la
     * sucursal menos todo lo ya entregado.
     */
    public record Summary(UUID branchId, List<DiningViews.BranchOption> branches, LocalDate from, LocalDate to,
                          BigDecimal collected, long count, List<MethodTotal> byMethod, BigDecimal pending,
                          List<Person> people, List<PayoutView> payouts) {
    }

    public record PayoutInput(UUID branchId, LocalDate from, LocalDate to, BigDecimal amount, List<UUID> memberIds,
                              boolean fromCash, String notes) {
    }

    @Transactional(readOnly = true)
    public Summary summary(UUID requestedBranch, LocalDate from, LocalDate to) {
        UUID branchId = dining.resolveBranch(requestedBranch);
        ZoneId zone = ZoneId.of(settings.current().timezone());
        LocalDate end = to == null ? LocalDate.now(zone) : to;
        LocalDate start = from == null ? end.withDayOfMonth(1) : from;
        requirePeriod(start, end);
        Instant since = start.atStartOfDay(zone).toInstant();
        Instant until = end.plusDays(1).atStartOfDay(zone).toInstant();
        Map<UUID, PaymentMethodRef> methods = cash.paymentMethods();
        List<MethodTotal> byMethod = new ArrayList<>();
        BigDecimal collected = BigDecimal.ZERO.setScale(2);
        long count = 0;
        for (Object[] r : dining.rows("""
                SELECT payment_method_id, method_code, sum(amount), count(*) FROM sale_tips
                WHERE branch_id = :b AND voided_at IS NULL AND created_at >= :since AND created_at < :until
                GROUP BY payment_method_id, method_code ORDER BY sum(amount) DESC""",
                Map.of("b", branchId, "since", since, "until", until))) {
            PaymentMethodRef m = methods.get((UUID) r[0]);
            BigDecimal amount = DiningService.money(r[2]);
            long n = ((Number) r[3]).longValue();
            byMethod.add(new MethodTotal(m == null ? (String) r[1] : m.name(), amount, n));
            collected = collected.add(amount);
            count += n;
        }
        return new Summary(branchId, dining.branches(), start, end, collected, count, byMethod, pending(branchId),
                people(branchId), payouts(branchId));
    }

    @Transactional
    public PayoutView payout(PayoutInput in) {
        UUID branchId = dining.resolveBranch(in.branchId());
        if (in.from() == null || in.to() == null) {
            throw new BusinessRuleException("Elige el periodo de las propinas que repartes.");
        }
        requirePeriod(in.from(), in.to());
        if (in.amount() == null || in.amount().signum() <= 0 || in.amount().stripTrailingZeros().scale() > 0) {
            throw new BusinessRuleException("Escribe el valor a repartir en pesos enteros.");
        }
        BigDecimal amount = in.amount().setScale(2, RoundingMode.UNNECESSARY);
        // Bloqueo por sucursal: dos repartos al tiempo no reparten lo mismo dos veces.
        dining.rows("SELECT id, name FROM branches WHERE id = :b FOR UPDATE", Map.of("b", branchId));
        BigDecimal pending = pending(branchId);
        if (amount.compareTo(pending) > 0) {
            throw new BusinessRuleException("Solo hay " + pending.stripTrailingZeros().toPlainString()
                    + " pendientes por repartir.");
        }
        Set<UUID> chosen = new LinkedHashSet<>(in.memberIds() == null ? List.of() : in.memberIds());
        chosen.remove(null);
        if (chosen.isEmpty() || chosen.size() > MAX_PEOPLE) {
            throw new BusinessRuleException("Elige entre 1 y " + MAX_PEOPLE + " personas para repartir.");
        }
        Map<UUID, String> candidates = new LinkedHashMap<>();
        people(branchId).forEach(p -> candidates.put(p.memberId(), p.name()));
        if (!candidates.keySet().containsAll(chosen)) {
            throw new NotFoundException("Una de las personas no trabaja en esta sucursal.");
        }
        UUID actor = CurrentActor.requireUserId();
        UUID sessionId = null;
        if (in.fromCash()) {
            OpenSession session = cash.lockOpenSessionOf(actor)
                    .orElseThrow(() -> new BusinessRuleException("Abre tu caja para entregar las propinas en efectivo."));
            if (!session.branchId().equals(branchId)) {
                throw new BusinessRuleException("Tu caja abierta es de otra sucursal.");
            }
            sessionId = session.id();
        }
        String notes = in.notes() == null || in.notes().isBlank() ? null
                : in.notes().trim().substring(0, Math.min(200, in.notes().trim().length()));
        UUID id = Ids.newId();
        em.createNativeQuery("""
                INSERT INTO tip_payouts (id, branch_id, period_from, period_to, amount, from_cash, cash_session_id, notes,
                                         created_by, created_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)""")
                .setParameter(1, id).setParameter(2, branchId).setParameter(3, in.from()).setParameter(4, in.to())
                .setParameter(5, amount).setParameter(6, in.fromCash()).setParameter(7, sessionId)
                .setParameter(8, notes).setParameter(9, actor).setParameter(10, Instant.now()).executeUpdate();
        List<UUID> people = List.copyOf(chosen);
        List<BigDecimal> shares = TipShares.split(amount, people.size());
        List<Map<String, Object>> auditShares = new ArrayList<>();
        for (int i = 0; i < people.size(); i++) {
            em.createNativeQuery("""
                    INSERT INTO tip_payout_shares (payout_id, member_id, name, amount) VALUES (?1, ?2, ?3, ?4)""")
                    .setParameter(1, id).setParameter(2, people.get(i)).setParameter(3, candidates.get(people.get(i)))
                    .setParameter(4, shares.get(i)).executeUpdate();
            auditShares.add(Map.of("name", candidates.get(people.get(i)), "amount", shares.get(i)));
        }
        long number = ((Number) em.createNativeQuery("SELECT number FROM tip_payouts WHERE id = ?1")
                .setParameter(1, id).getSingleResult()).longValue();
        if (sessionId != null) {
            cash.recordTipPayoutCash(sessionId, amount, id, "Reparto de propinas #" + number);
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("number", number);
        data.put("from", in.from().toString());
        data.put("to", in.to().toString());
        data.put("amount", amount);
        data.put("fromCash", in.fromCash());
        data.put("shares", auditShares);
        audit.log("TIP_PAYOUT_CREATED", "tip_payout", id, null, data);
        return payouts(branchId).stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
    }

    private BigDecimal pending(UUID branchId) {
        BigDecimal collected = DiningService.money(single("""
                SELECT coalesce(sum(amount), 0) FROM sale_tips WHERE branch_id = :b AND voided_at IS NULL""", branchId));
        BigDecimal paid = DiningService.money(single("""
                SELECT coalesce(sum(amount), 0) FROM tip_payouts WHERE branch_id = :b""", branchId));
        return collected.subtract(paid).max(BigDecimal.ZERO);
    }

    /** Quienes trabajan en la sucursal (activos), para elegir entre quiénes se reparte. */
    private List<Person> people(UUID branchId) {
        List<Person> result = new ArrayList<>();
        for (Object[] r : dining.rows("""
                SELECT m.id, m.display_name FROM members m
                WHERE m.active AND (m.default_branch_id = :b
                      OR EXISTS (SELECT 1 FROM member_branches mb WHERE mb.member_id = m.id AND mb.branch_id = :b))
                ORDER BY lower(m.display_name)""", Map.of("b", branchId))) {
            result.add(new Person((UUID) r[0], (String) r[1]));
        }
        return result;
    }

    private List<PayoutView> payouts(UUID branchId) {
        Map<UUID, List<Share>> shares = new LinkedHashMap<>();
        for (Object[] r : dining.rows("""
                SELECT s.payout_id, s.member_id, s.name, s.amount FROM tip_payout_shares s
                JOIN tip_payouts p ON p.id = s.payout_id WHERE p.branch_id = :b ORDER BY s.payout_id, s.name""",
                Map.of("b", branchId))) {
            shares.computeIfAbsent((UUID) r[0], k -> new ArrayList<>())
                    .add(new Share((UUID) r[1], (String) r[2], DiningService.money(r[3])));
        }
        List<Object[]> rows = dining.rows("""
                SELECT p.id, p.number, p.period_from, p.period_to, p.amount, p.from_cash, p.notes, coalesce(m.display_name, ''),
                       p.created_at
                FROM tip_payouts p LEFT JOIN members m ON m.id = p.created_by
                WHERE p.branch_id = :b ORDER BY p.number DESC LIMIT 20""", Map.of("b", branchId));
        List<PayoutView> result = new ArrayList<>();
        for (Object[] r : rows) {
            UUID id = (UUID) r[0];
            result.add(new PayoutView(id, ((Number) r[1]).longValue(), Rows.date(r[2]), Rows.date(r[3]),
                    DiningService.money(r[4]), (Boolean) r[5], (String) r[6], (String) r[7], Rows.instant(r[8]),
                    shares.getOrDefault(id, List.of())));
        }
        return result;
    }

    private static void requirePeriod(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessRuleException("La fecha final es anterior a la inicial.");
        }
        if (ChronoUnit.DAYS.between(from, to) + 1 > MAX_DAYS) {
            throw new BusinessRuleException("Elige un periodo de máximo un mes (" + MAX_DAYS + " días).");
        }
    }

    private Object single(String sql, UUID branchId) {
        return em.createNativeQuery(sql).setParameter("b", branchId).getSingleResult();
    }
}
