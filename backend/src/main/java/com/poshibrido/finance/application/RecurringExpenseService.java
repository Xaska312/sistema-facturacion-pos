package com.poshibrido.finance.application;

import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.finance.application.ExpenseService.CreateCommand;
import com.poshibrido.finance.application.ExpenseViews.ExpenseView;
import com.poshibrido.finance.domain.RecurringSchedule;
import com.poshibrido.finance.domain.RecurringSchedule.Frequency;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Gastos fijos (Finanzas parte A2, decisión 321): el arriendo, la nómina o el internet que se repiten cada mes o cada
 * quincena. XASKA avisa cuándo toca pagarlos (en Gastos y en Inicio); al confirmar se registra un gasto normal con lo
 * sugerido, que se puede cambiar antes de guardar, y "Este mes no" salta una fecha sin registrar nada. Lo pendiente no
 * se guarda: se calcula con {@link RecurringSchedule} desde el inicio del gasto fijo.
 */
@Service
@RequiredArgsConstructor
public class RecurringExpenseService {

    /** Hasta cuántos días atrás se muestran las fechas sin pagar ni saltar. */
    static final int LOOKBACK_DAYS = 92;
    /** Con cuántos días de anticipación se avisa. */
    static final int AHEAD_DAYS = 7;
    static final int MAX_RECURRING = 100;

    private static final String SELECT = """
            SELECT r.id, r.name, r.category_id, c.name, r.branch_id, b.name, r.supplier_id,
                   coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, ''))),
                   r.amount, r.payment_method_id, pm.name, pm.affects_cash, r.frequency, r.day_of_month, r.starts_on,
                   r.note, r.active
            FROM recurring_expenses r
            JOIN expense_categories c ON c.id = r.category_id
            JOIN branches b ON b.id = r.branch_id
            JOIN payment_methods pm ON pm.id = r.payment_method_id
            LEFT JOIN parties p ON p.id = r.supplier_id
            """;

    @PersistenceContext
    private EntityManager em;

    private final ExpenseService expenses;
    private final BranchApi branches;
    private final AuditLogger audit;

    // ------------------------------------------------------------------ vistas y comandos

    public record RecurringView(UUID id, String name, UUID categoryId, String categoryName, UUID branchId,
                                String branchName, UUID supplierId, String supplierName, BigDecimal amount,
                                UUID paymentMethodId, String paymentMethodName, boolean fromCash, String frequency,
                                Integer dayOfMonth, LocalDate startsOn, String note, boolean active, LocalDate nextDue) {
    }

    /** Una fecha por pagar. {@code daysUntil} negativo: vencida hace esos días. */
    public record DueView(UUID recurringId, String name, LocalDate dueDate, boolean overdue, long daysUntil,
                          String frequency, UUID categoryId, String categoryName, UUID branchId, String branchName,
                          UUID supplierId, String supplierName, BigDecimal amount, UUID paymentMethodId,
                          String paymentMethodName, boolean fromCash, String note) {
    }

    public record DueSummary(int count, int overdueCount, BigDecimal total, List<DueView> items) {
    }

    public record SaveCommand(String name, UUID categoryId, UUID branchId, UUID supplierId, BigDecimal amount,
                              UUID paymentMethodId, String frequency, Integer dayOfMonth, LocalDate startsOn,
                              String note, Boolean active) {
    }

    /** Lo que se paga de verdad: lo que venga vacío se toma del gasto fijo. */
    public record PayCommand(LocalDate dueDate, BigDecimal amount, UUID paymentMethodId, UUID branchId, LocalDate date,
                             UUID supplierId, String reference, String note) {
    }

    // ------------------------------------------------------------------ gastos fijos

    @Transactional(readOnly = true)
    public List<RecurringView> list() {
        LocalDate today = LocalDate.now(expenses.zone());
        List<RecurringView> result = new ArrayList<>();
        for (Object row : em.createNativeQuery(SELECT + " ORDER BY r.active DESC, lower(r.name)").getResultList()) {
            result.add(view((Object[]) row, today));
        }
        return result;
    }

    @Transactional
    public RecurringView create(SaveCommand c) {
        long count = ((Number) em.createNativeQuery("SELECT count(*) FROM recurring_expenses").getSingleResult())
                .longValue();
        if (count >= MAX_RECURRING) {
            throw new BusinessRuleException("Ya hay " + MAX_RECURRING + " gastos fijos. Apaga o reutiliza uno.");
        }
        Valid v = validate(c, null);
        UUID id = Ids.newId();
        Timestamp now = Timestamp.from(Instant.now());
        em.createNativeQuery("""
                INSERT INTO recurring_expenses (id, name, category_id, branch_id, supplier_id, amount, payment_method_id,
                    frequency, day_of_month, starts_on, note, active, created_by, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, true, ?12, ?13, ?13)""")
                .setParameter(1, id).setParameter(2, v.name()).setParameter(3, c.categoryId())
                .setParameter(4, c.branchId()).setParameter(5, c.supplierId()).setParameter(6, v.amount())
                .setParameter(7, c.paymentMethodId()).setParameter(8, v.schedule().frequency().name())
                .setParameter(9, v.schedule().dayOfMonth()).setParameter(10, Date.valueOf(v.schedule().startsOn()))
                .setParameter(11, v.note()).setParameter(12, CurrentActor.requireUserId()).setParameter(13, now)
                .executeUpdate();
        RecurringView view = get(id);
        audit.log("RECURRING_EXPENSE_CREATED", "recurring_expense", id, null, data(view));
        return view;
    }

    /** Cambia lo sugerido o la frecuencia, o lo apaga ({@code active=false}). Lo ya pagado no cambia. */
    @Transactional
    public RecurringView update(UUID id, SaveCommand c) {
        RecurringView before = locked(id);
        Valid v = validate(c, before);
        boolean active = c.active() == null ? before.active() : c.active();
        em.createNativeQuery("""
                UPDATE recurring_expenses SET name = ?2, category_id = ?3, branch_id = ?4, supplier_id = ?5, amount = ?6,
                    payment_method_id = ?7, frequency = ?8, day_of_month = ?9, starts_on = ?10, note = ?11, active = ?12,
                    updated_at = ?13
                WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, v.name()).setParameter(3, c.categoryId())
                .setParameter(4, c.branchId()).setParameter(5, c.supplierId()).setParameter(6, v.amount())
                .setParameter(7, c.paymentMethodId()).setParameter(8, v.schedule().frequency().name())
                .setParameter(9, v.schedule().dayOfMonth()).setParameter(10, Date.valueOf(v.schedule().startsOn()))
                .setParameter(11, v.note()).setParameter(12, active).setParameter(13, Timestamp.from(Instant.now()))
                .executeUpdate();
        RecurringView after = get(id);
        audit.log("RECURRING_EXPENSE_UPDATED", "recurring_expense", id, data(before), data(after));
        return after;
    }

    // ------------------------------------------------------------------ por pagar

    /** Fechas sin pagar ni saltar de los gastos fijos prendidos: las vencidas (hasta 3 meses) y las de esta semana. */
    @Transactional(readOnly = true)
    public DueSummary due() {
        LocalDate today = LocalDate.now(expenses.zone());
        LocalDate from = today.minusDays(LOOKBACK_DAYS);
        LocalDate to = today.plusDays(AHEAD_DAYS);
        Set<String> done = new HashSet<>();
        for (Object row : em.createNativeQuery("""
                SELECT o.recurring_id, o.due_date FROM recurring_expense_occurrences o
                LEFT JOIN expenses e ON e.id = o.expense_id
                WHERE o.due_date BETWEEN ?1 AND ?2 AND (o.status = 'SKIPPED' OR e.status = 'ACTIVE')""")
                .setParameter(1, Date.valueOf(from)).setParameter(2, Date.valueOf(to)).getResultList()) {
            Object[] r = (Object[]) row;
            done.add(r[0] + "|" + toDate(r[1]));
        }
        List<DueView> items = new ArrayList<>();
        for (Object row : em.createNativeQuery(SELECT + " WHERE r.active").getResultList()) {
            RecurringView r = view((Object[]) row, today);
            for (LocalDate date : schedule(r).between(from, to)) {
                if (!done.contains(r.id() + "|" + date)) {
                    items.add(dueView(r, date, today));
                }
            }
        }
        items.sort(Comparator.comparing(DueView::dueDate).thenComparing(DueView::name, String.CASE_INSENSITIVE_ORDER));
        BigDecimal total = items.stream().map(DueView::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        int overdue = (int) items.stream().filter(DueView::overdue).count();
        return new DueSummary(items.size(), overdue, total, items);
    }

    /** Fechas de los gastos fijos prendidos entre {@code from} y {@code to} que no se han pagado ni saltado. */
    @Transactional(readOnly = true)
    public DueSummary unpaidBetween(LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now(expenses.zone());
        Set<String> done = new HashSet<>();
        for (Object row : em.createNativeQuery("""
                SELECT o.recurring_id, o.due_date FROM recurring_expense_occurrences o
                LEFT JOIN expenses e ON e.id = o.expense_id
                WHERE o.due_date BETWEEN ?1 AND ?2 AND (o.status = 'SKIPPED' OR e.status = 'ACTIVE')""")
                .setParameter(1, Date.valueOf(from)).setParameter(2, Date.valueOf(to)).getResultList()) {
            Object[] r = (Object[]) row;
            done.add(r[0] + "|" + toDate(r[1]));
        }
        List<DueView> items = new ArrayList<>();
        for (Object row : em.createNativeQuery(SELECT + " WHERE r.active").getResultList()) {
            RecurringView r = view((Object[]) row, today);
            for (LocalDate date : schedule(r).between(from, to)) {
                if (!done.contains(r.id() + "|" + date)) {
                    items.add(dueView(r, date, today));
                }
            }
        }
        items.sort(Comparator.comparing(DueView::dueDate));
        BigDecimal total = items.stream().map(DueView::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new DueSummary(items.size(), (int) items.stream().filter(DueView::overdue).count(), total, items);
    }

    /**
     * Registra el gasto de una fecha con lo sugerido y lo que se cambie. Si la fecha ya se pagó con un gasto que se
     * anuló, vuelve a pagarse; con la misma Idempotency-Key, repetir devuelve el mismo gasto.
     */
    @Transactional
    public ExpenseView pay(UUID id, PayCommand c, String idempotencyKey) {
        RecurringView r = locked(id);
        LocalDate dueDate = requireDueDate(r, c.dueDate());
        Object[] previous = occurrence(id, dueDate);
        if (previous != null) {
            if ("SKIPPED".equals(previous[0])) {
                throw new ConflictException("Esa fecha se marcó para no pagarla. Deshazlo primero si sí se pagó.");
            }
            if ("ACTIVE".equals(previous[2])) {
                String key = idempotencyKey == null ? null : idempotencyKey.trim();
                if (key != null && key.equals(previous[3])) {
                    return expenses.get((UUID) previous[1]);
                }
                throw new ConflictException("Ese pago ya está registrado.");
            }
        }
        LocalDate today = LocalDate.now(expenses.zone());
        UUID methodId = c.paymentMethodId() == null ? r.paymentMethodId() : c.paymentMethodId();
        PaymentMethodRef method = expenses.requireMethod(methodId);
        LocalDate date = method.affectsCash() ? null
                : c.date() != null ? c.date() : dueDate.isAfter(today) ? today : dueDate;
        String note = ExpenseService.clean(c.note(), 255);
        ExpenseView expense = expenses.create(new CreateCommand(
                c.amount() == null ? r.amount() : c.amount(), r.categoryId(), methodId,
                method.affectsCash() ? null : c.branchId() == null ? r.branchId() : c.branchId(), date,
                c.supplierId() == null ? r.supplierId() : c.supplierId(), c.reference(),
                note == null ? r.name() : note), idempotencyKey);
        em.createNativeQuery("""
                INSERT INTO recurring_expense_occurrences (recurring_id, due_date, status, expense_id, done_by, done_at)
                VALUES (?1, ?2, 'PAID', ?3, ?4, ?5)
                ON CONFLICT (recurring_id, due_date) DO UPDATE SET status = 'PAID', expense_id = EXCLUDED.expense_id,
                    done_by = EXCLUDED.done_by, done_at = EXCLUDED.done_at""")
                .setParameter(1, id).setParameter(2, Date.valueOf(dueDate)).setParameter(3, expense.id())
                .setParameter(4, CurrentActor.requireUserId()).setParameter(5, Timestamp.from(Instant.now()))
                .executeUpdate();
        Map<String, Object> data = occurrenceData(r, dueDate);
        data.put("expenseNumber", expense.number());
        data.put("amount", expense.amount());
        audit.log("RECURRING_EXPENSE_PAID", "recurring_expense", id, null, data);
        return expense;
    }

    /** "Este mes no": la fecha deja de estar por pagar sin registrar ningún gasto. */
    @Transactional
    public void skip(UUID id, LocalDate requested) {
        RecurringView r = locked(id);
        LocalDate dueDate = requireDueDate(r, requested);
        Object[] previous = occurrence(id, dueDate);
        if (previous != null && ("SKIPPED".equals(previous[0]) || "ACTIVE".equals(previous[2]))) {
            throw new ConflictException("SKIPPED".equals(previous[0]) ? "Esa fecha ya estaba saltada."
                    : "Esa fecha ya se pagó: si no correspondía, anula el gasto.");
        }
        em.createNativeQuery("""
                INSERT INTO recurring_expense_occurrences (recurring_id, due_date, status, expense_id, done_by, done_at)
                VALUES (?1, ?2, 'SKIPPED', NULL, ?3, ?4)
                ON CONFLICT (recurring_id, due_date) DO UPDATE SET status = 'SKIPPED', expense_id = NULL,
                    done_by = EXCLUDED.done_by, done_at = EXCLUDED.done_at""")
                .setParameter(1, id).setParameter(2, Date.valueOf(dueDate))
                .setParameter(3, CurrentActor.requireUserId()).setParameter(4, Timestamp.from(Instant.now()))
                .executeUpdate();
        audit.log("RECURRING_EXPENSE_SKIPPED", "recurring_expense", id, null, occurrenceData(r, dueDate));
    }

    /** Deshace "Este mes no": la fecha vuelve a quedar por pagar. */
    @Transactional
    public void unskip(UUID id, LocalDate dueDate) {
        RecurringView r = locked(id);
        int removed = em.createNativeQuery("""
                DELETE FROM recurring_expense_occurrences WHERE recurring_id = ?1 AND due_date = ?2 AND status = 'SKIPPED'""")
                .setParameter(1, id).setParameter(2, dueDate == null ? null : Date.valueOf(dueDate)).executeUpdate();
        if (removed == 0) {
            throw new NotFoundException("Esa fecha no estaba saltada.");
        }
        audit.log("RECURRING_EXPENSE_UNSKIPPED", "recurring_expense", id, null, occurrenceData(r, dueDate));
    }

    // ------------------------------------------------------------------ apoyo

    private record Valid(String name, BigDecimal amount, RecurringSchedule schedule, String note) {
    }

    private Valid validate(SaveCommand c, RecurringView before) {
        String name = c.name() == null ? "" : c.name().trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            throw new BusinessRuleException("Escribe el nombre del gasto fijo (ej.: Arriendo del local).");
        }
        if (name.length() > 80) {
            throw new BusinessRuleException("El nombre es muy largo (máximo 80 letras).");
        }
        List<?> same = em.createNativeQuery("SELECT id FROM recurring_expenses WHERE lower(name) = lower(?1)")
                .setParameter(1, name).getResultList();
        if (!same.isEmpty() && (before == null || !same.getFirst().equals(before.id()))) {
            throw new ConflictException("Ya hay un gasto fijo con ese nombre.");
        }
        BigDecimal amount = ExpenseService.amount(c.amount());
        boolean sameCategory = before != null && before.categoryId().equals(c.categoryId());
        expenses.requireCategory(c.categoryId(), !sameCategory);
        expenses.requireMethod(c.paymentMethodId());
        boolean sameBranch = before != null && before.branchId().equals(c.branchId());
        if (c.branchId() == null || (!sameBranch && branches.findByIds(List.of(c.branchId())).stream()
                .noneMatch(BranchApi.BranchRef::active))) {
            throw new BusinessRuleException("Elige la sede del gasto fijo.");
        }
        if (c.supplierId() != null && (before == null || !c.supplierId().equals(before.supplierId()))) {
            expenses.requireSupplier(c.supplierId());
        }
        Frequency frequency;
        try {
            frequency = Frequency.valueOf(c.frequency() == null ? "" : c.frequency().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException("Elige cada cuánto se paga: cada mes o cada quincena.");
        }
        if (frequency == Frequency.MONTHLY && (c.dayOfMonth() == null || c.dayOfMonth() < 1 || c.dayOfMonth() > 31)) {
            throw new BusinessRuleException("Elige el día del mes en que se paga (1 a 31).");
        }
        LocalDate startsOn = c.startsOn() != null ? c.startsOn()
                : before != null ? before.startsOn() : LocalDate.now(expenses.zone());
        return new Valid(name, amount, new RecurringSchedule(frequency, c.dayOfMonth(), startsOn),
                ExpenseService.clean(c.note(), 255));
    }

    private LocalDate requireDueDate(RecurringView r, LocalDate dueDate) {
        if (dueDate == null || !schedule(r).isDue(dueDate)) {
            throw new BusinessRuleException("Esa fecha no le toca a este gasto fijo.");
        }
        if (dueDate.isAfter(LocalDate.now(expenses.zone()).plusDays(AHEAD_DAYS))) {
            throw new BusinessRuleException("Todavía no toca: se puede pagar desde una semana antes.");
        }
        return dueDate;
    }

    /** {@code [status, expense_id, estado del gasto, idempotency_key del gasto]} o nulo. */
    private Object[] occurrence(UUID id, LocalDate dueDate) {
        List<?> found = em.createNativeQuery("""
                SELECT o.status, o.expense_id, e.status, e.idempotency_key FROM recurring_expense_occurrences o
                LEFT JOIN expenses e ON e.id = o.expense_id WHERE o.recurring_id = ?1 AND o.due_date = ?2""")
                .setParameter(1, id).setParameter(2, Date.valueOf(dueDate)).getResultList();
        return found.isEmpty() ? null : (Object[]) found.getFirst();
    }

    private RecurringView locked(UUID id) {
        if (em.createNativeQuery("SELECT id FROM recurring_expenses WHERE id = ?1 FOR UPDATE").setParameter(1, id)
                .getResultList().isEmpty()) {
            throw new NotFoundException("Gasto fijo no encontrado.");
        }
        return get(id);
    }

    private RecurringView get(UUID id) {
        List<?> found = em.createNativeQuery(SELECT + " WHERE r.id = ?1").setParameter(1, id).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Gasto fijo no encontrado.");
        }
        return view((Object[]) found.getFirst(), LocalDate.now(expenses.zone()));
    }

    private static RecurringSchedule schedule(RecurringView r) {
        return new RecurringSchedule(Frequency.valueOf(r.frequency()), r.dayOfMonth(), r.startsOn());
    }

    private static RecurringView view(Object[] r, LocalDate today) {
        Integer day = r[13] == null ? null : ((Number) r[13]).intValue();
        LocalDate startsOn = toDate(r[14]);
        boolean active = Boolean.TRUE.equals(r[16]);
        String frequency = (String) r[12];
        LocalDate next = active ? new RecurringSchedule(Frequency.valueOf(frequency), day, startsOn).nextFrom(today) : null;
        return new RecurringView((UUID) r[0], (String) r[1], (UUID) r[2], (String) r[3], (UUID) r[4], (String) r[5],
                (UUID) r[6], r[6] == null ? null : (String) r[7], ExpenseService.money(r[8]), (UUID) r[9],
                (String) r[10], Boolean.TRUE.equals(r[11]), frequency, day, startsOn, (String) r[15], active, next);
    }

    private static DueView dueView(RecurringView r, LocalDate date, LocalDate today) {
        long days = ChronoUnit.DAYS.between(today, date);
        return new DueView(r.id(), r.name(), date, days < 0, days, r.frequency(), r.categoryId(), r.categoryName(),
                r.branchId(), r.branchName(), r.supplierId(), r.supplierName(), r.amount(), r.paymentMethodId(),
                r.paymentMethodName(), r.fromCash(), r.note());
    }

    private static Map<String, Object> data(RecurringView r) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", r.name());
        data.put("category", r.categoryName());
        data.put("amount", r.amount());
        data.put("method", r.paymentMethodName());
        data.put("branch", r.branchName());
        data.put("frequency", r.frequency());
        if (r.dayOfMonth() != null) {
            data.put("dayOfMonth", r.dayOfMonth());
        }
        data.put("startsOn", r.startsOn().toString());
        if (r.supplierName() != null) {
            data.put("supplier", r.supplierName());
        }
        data.put("active", r.active());
        return data;
    }

    private static Map<String, Object> occurrenceData(RecurringView r, LocalDate dueDate) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", r.name());
        data.put("dueDate", String.valueOf(dueDate));
        return data;
    }

    private static LocalDate toDate(Object value) {
        return value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }
}
