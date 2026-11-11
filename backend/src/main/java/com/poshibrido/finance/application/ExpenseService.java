package com.poshibrido.finance.application;

import com.poshibrido.access.application.MemberDirectory;
import com.poshibrido.audit.application.AuditLogger;
import com.poshibrido.cash.application.CashApi;
import com.poshibrido.cash.application.CashApi.OpenSession;
import com.poshibrido.cash.application.CashApi.PaymentMethodRef;
import com.poshibrido.finance.application.ExpenseViews.CategoryTotal;
import com.poshibrido.finance.application.ExpenseViews.ExpenseView;
import com.poshibrido.finance.application.ExpenseViews.MethodTotal;
import com.poshibrido.finance.application.ExpenseViews.StoredFile;
import com.poshibrido.finance.application.ExpenseViews.Summary;
import com.poshibrido.organization.application.BranchApi;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.csv.CsvWriter;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.ConflictException;
import com.poshibrido.shared.error.ForbiddenException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.shared.security.CurrentActor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
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
import java.util.regex.Pattern;

/**
 * Gastos del negocio (Finanzas parte A, decisión 320).
 * <ul>
 *   <li>Cada gasto tiene categoría, sede, medio de pago y, si se quiere, proveedor, nota y soporte.</li>
 *   <li>Pagado en efectivo sale de la caja abierta de quien lo registra (queda como egreso de esa caja); con otro
 *       medio (transferencia, tarjeta…) no toca la caja y puede llevar una fecha anterior.</li>
 *   <li>No se borra: se anula con motivo. El efectivo de un gasto anulado vuelve a su caja, y por eso solo se anula
 *       mientras esa caja siga abierta.</li>
 *   <li>Los egresos de caja de antes aparecen "sin clasificar" hasta que alguien les pone categoría.</li>
 *   <li>Los pagos a proveedores por mercancía no son gastos: esa plata ya cuenta como costo de lo vendido.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class ExpenseService {

    public static final String MANAGE = "expenses:manage";
    public static final String UNCLASSIFIED = "Sin clasificar";
    static final int MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
    static final int MAX_EXPORT_ROWS = 20_000;
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9_\\-]{8,100}$");
    private static final Set<String> NOT_FOR_EXPENSES = Set.of("CREDIT", "DEPOSIT", "WITHHOLDING");

    /**
     * Gastos registrados más los egresos de caja que nadie ha clasificado (los manuales de antes: sin referencia y
     * sin un gasto que los tome). {@code :zone} es la zona horaria del negocio, para la fecha del egreso.
     */
    private static final String ALL = """
            WITH x AS (
                SELECT e.id, e.number, e.expense_date, e.category_id, e.branch_id, e.supplier_id, e.amount,
                       e.payment_method_id, e.cash_session_id, e.reference, e.note, e.status, e.void_reason,
                       e.created_by, e.created_at, false AS unclassified,
                       EXISTS (SELECT 1 FROM expense_documents d WHERE d.expense_id = e.id) AS has_document
                FROM expenses e
                UNION ALL
                SELECT m.id, CAST(NULL AS bigint), CAST(m.created_at AT TIME ZONE :zone AS date), CAST(NULL AS uuid),
                       s.branch_id, CAST(NULL AS uuid), -m.amount,
                       (SELECT pm.id FROM payment_methods pm WHERE pm.code = 'CASH'), m.cash_session_id,
                       CAST(NULL AS varchar), m.reason, 'ACTIVE', CAST(NULL AS varchar), m.created_by, m.created_at,
                       true, false
                FROM cash_movements m JOIN cash_sessions s ON s.id = m.cash_session_id
                WHERE m.type = 'EXPENSE' AND m.reference_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.cash_movement_id = m.id)
            )
            """;

    private static final String ROW = """
            SELECT x.id, x.number, x.expense_date, x.category_id, c.name AS category_name, x.branch_id,
                   b.name AS branch_name, x.supplier_id,
                   coalesce(p.business_name, trim(coalesce(p.first_names, '') || ' ' || coalesce(p.last_names, '')))
                       AS supplier_name,
                   x.amount, x.payment_method_id, pm.name AS method_name, x.cash_session_id,
                   coalesce(cs.status = 'OPEN', false) AS session_open, x.reference, x.note, x.status, x.void_reason,
                   x.unclassified, x.has_document, x.created_by, x.created_at
            FROM x
            LEFT JOIN expense_categories c ON c.id = x.category_id
            LEFT JOIN branches b ON b.id = x.branch_id
            LEFT JOIN parties p ON p.id = x.supplier_id
            LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id
            LEFT JOIN cash_sessions cs ON cs.id = x.cash_session_id
            """;

    @PersistenceContext
    private EntityManager em;

    private final CashApi cash;
    private final BranchApi branches;
    private final MemberDirectory members;
    private final BusinessSettingsApi settings;
    private final AuditLogger audit;

    // ------------------------------------------------------------------ comandos

    public record CreateCommand(BigDecimal amount, UUID categoryId, UUID paymentMethodId, UUID branchId,
                                LocalDate date, UUID supplierId, String reference, String note) {
    }

    public record UpdateCommand(UUID categoryId, LocalDate date, UUID supplierId, String reference, String note) {
    }

    public record ClassifyCommand(UUID categoryId, UUID supplierId, String note) {
    }

    /**
     * Filtro del listado. {@code source}: CASH (salió de una caja) u OTHER. {@code unclassified}: solo los egresos
     * de caja sin categoría. {@code includeVoided}: también los anulados (nunca suman en los totales).
     */
    public record Filter(LocalDate from, LocalDate to, UUID categoryId, UUID branchId, UUID supplierId,
                         UUID paymentMethodId, String source, boolean unclassified, boolean includeVoided,
                         String text) {
    }

    @Transactional
    public ExpenseView create(CreateCommand c, String idempotencyKey) {
        UUID actor = CurrentActor.requireUserId();
        String key = idempotencyKey == null || idempotencyKey.isBlank() ? null : idempotencyKey.trim();
        if (key != null && !IDEMPOTENCY_KEY.matcher(key).matches()) {
            throw new BusinessRuleException("Idempotency-Key inválida.");
        }
        if (key != null) {
            List<?> previous = em.createNativeQuery(
                    "SELECT id FROM expenses WHERE idempotency_key = ?1 AND created_by = ?2")
                    .setParameter(1, key).setParameter(2, actor).getResultList();
            if (!previous.isEmpty()) {
                return get((UUID) previous.getFirst());
            }
        }
        BigDecimal amount = amount(c.amount());
        String category = requireCategory(c.categoryId(), true);
        PaymentMethodRef method = requireMethod(c.paymentMethodId());
        if (!method.affectsCash() && !CurrentActor.permissions().contains(MANAGE)) {
            throw new ForbiddenException("Desde la caja solo se registran gastos en efectivo.");
        }
        if (c.supplierId() != null) {
            requireSupplier(c.supplierId());
        }
        String note = clean(c.note(), 255);
        String reference = clean(c.reference(), 100);
        if (method.requiresReference() && reference == null) {
            throw new BusinessRuleException("Escribe la referencia del pago (" + method.name() + ").");
        }
        LocalDate today = LocalDate.now(zone());
        UUID id = Ids.newId();
        UUID branchId;
        UUID cashSession = null;
        LocalDate date;
        if (method.affectsCash()) {
            // El efectivo sale de la caja de quien lo registra: la sede y la fecha son las de esa caja, hoy.
            if (c.date() != null && !c.date().equals(today)) {
                throw new BusinessRuleException("Un gasto en efectivo sale de la caja de hoy: no lleva otra fecha. "
                        + "Si lo pagaste otro día, elige el medio con que lo pagaste.");
            }
            String label = "Gasto · " + category + (note == null ? "" : " · " + note);
            OpenSession session = cash.recordExpenseCash(actor, amount, id,
                    label.substring(0, Math.min(255, label.length())));
            cashSession = session.id();
            branchId = session.branchId();
            date = today;
        } else {
            if (c.branchId() == null || branches.findByIds(List.of(c.branchId())).stream()
                    .noneMatch(BranchApi.BranchRef::active)) {
                throw new BusinessRuleException("Elige la sede del gasto.");
            }
            branchId = c.branchId();
            date = c.date() == null ? today : c.date();
            if (date.isAfter(today)) {
                throw new BusinessRuleException("La fecha del gasto no puede ser futura.");
            }
        }
        Timestamp now = Timestamp.from(Instant.now());
        em.createNativeQuery("""
                INSERT INTO expenses (id, expense_date, category_id, branch_id, supplier_id, amount, payment_method_id,
                    cash_session_id, reference, note, idempotency_key, created_by, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13)""")
                .setParameter(1, id).setParameter(2, Date.valueOf(date)).setParameter(3, c.categoryId())
                .setParameter(4, branchId).setParameter(5, c.supplierId()).setParameter(6, amount)
                .setParameter(7, method.id()).setParameter(8, cashSession).setParameter(9, reference)
                .setParameter(10, note).setParameter(11, key).setParameter(12, actor).setParameter(13, now)
                .executeUpdate();
        ExpenseView view = get(id);
        audit.log("EXPENSE_CREATED", "expense", id, null, snapshot(view));
        return view;
    }

    /** Le pone categoría a un egreso de caja de antes: crea su gasto sin mover otra vez la caja. */
    @Transactional
    public ExpenseView classify(UUID movementId, ClassifyCommand c) {
        List<?> found = em.createNativeQuery("""
                SELECT -m.amount, m.reason, m.created_by, m.created_at, m.cash_session_id, s.branch_id,
                       CAST(m.created_at AT TIME ZONE ?2 AS date),
                       (SELECT e.id FROM expenses e WHERE e.cash_movement_id = m.id)
                FROM cash_movements m JOIN cash_sessions s ON s.id = m.cash_session_id
                WHERE m.id = ?1 AND m.type = 'EXPENSE' AND m.reference_id IS NULL""")
                .setParameter(1, movementId).setParameter(2, zone().getId()).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Egreso de caja no encontrado.");
        }
        Object[] m = (Object[]) found.getFirst();
        if (m[7] != null) {
            throw new ConflictException("Ese egreso ya fue clasificado.");
        }
        requireCategory(c.categoryId(), true);
        if (c.supplierId() != null) {
            requireSupplier(c.supplierId());
        }
        List<?> cashMethod = em.createNativeQuery("SELECT id FROM payment_methods WHERE code = 'CASH'").getResultList();
        if (cashMethod.isEmpty()) {
            throw new BusinessRuleException("El negocio no tiene el medio de pago Efectivo.");
        }
        UUID actor = CurrentActor.requireUserId();
        String note = clean(c.note(), 255);
        UUID id = Ids.newId();
        try {
            em.createNativeQuery("""
                    INSERT INTO expenses (id, expense_date, category_id, branch_id, supplier_id, amount,
                        payment_method_id, cash_session_id, cash_movement_id, note, created_by, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)""")
                    .setParameter(1, id).setParameter(2, m[6]).setParameter(3, c.categoryId()).setParameter(4, m[5])
                    .setParameter(5, c.supplierId()).setParameter(6, m[0]).setParameter(7, cashMethod.getFirst())
                    .setParameter(8, m[4]).setParameter(9, movementId)
                    .setParameter(10, note == null ? m[1] : note).setParameter(11, m[2] == null ? actor : m[2])
                    .setParameter(12, m[3]).setParameter(13, Timestamp.from(Instant.now())).executeUpdate();
        } catch (jakarta.persistence.PersistenceException ex) {
            throw new ConflictException("Ese egreso ya fue clasificado.");
        }
        ExpenseView view = get(id);
        Map<String, Object> data = snapshot(view);
        data.put("cashMovementId", movementId);
        audit.log("EXPENSE_CLASSIFIED", "expense", id, null, data);
        return view;
    }

    /** Corrige la categoría, el proveedor, la nota, la referencia y (si no salió de una caja) la fecha. */
    @Transactional
    public ExpenseView update(UUID id, UpdateCommand c) {
        ExpenseView before = locked(id);
        if (!"ACTIVE".equals(before.status())) {
            throw new BusinessRuleException("Un gasto anulado no se modifica.");
        }
        requireCategory(c.categoryId(), c.categoryId() == null || !c.categoryId().equals(before.categoryId()));
        if (c.supplierId() != null && !c.supplierId().equals(before.supplierId())) {
            requireSupplier(c.supplierId());
        }
        LocalDate date = c.date() == null ? before.date() : c.date();
        if (!date.equals(before.date())) {
            if (before.fromCash()) {
                throw new BusinessRuleException("La fecha de un gasto en efectivo es la del día en que salió de la caja.");
            }
            if (date.isAfter(LocalDate.now(zone()))) {
                throw new BusinessRuleException("La fecha del gasto no puede ser futura.");
            }
        }
        String reference = clean(c.reference(), 100);
        PaymentMethodRef method = cash.paymentMethods().get(before.paymentMethodId());
        if (method != null && method.requiresReference() && reference == null) {
            throw new BusinessRuleException("Escribe la referencia del pago (" + method.name() + ").");
        }
        em.createNativeQuery("""
                UPDATE expenses SET category_id = ?2, supplier_id = ?3, note = ?4, reference = ?5, expense_date = ?6,
                    updated_at = ?7 WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, c.categoryId()).setParameter(3, c.supplierId())
                .setParameter(4, clean(c.note(), 255)).setParameter(5, reference).setParameter(6, Date.valueOf(date))
                .setParameter(7, Timestamp.from(Instant.now())).executeUpdate();
        ExpenseView after = get(id);
        audit.log("EXPENSE_UPDATED", "expense", id, snapshot(before), snapshot(after));
        return after;
    }

    /** Anula el gasto. Si salió de una caja, el efectivo vuelve a ella (solo mientras siga abierta). */
    @Transactional
    public ExpenseView voidExpense(UUID id, String reason) {
        String why = clean(reason, 255);
        if (why == null) {
            throw new BusinessRuleException("Escribe por qué anulas el gasto.");
        }
        ExpenseView before = locked(id);
        if (!"ACTIVE".equals(before.status())) {
            throw new ConflictException("Ese gasto ya estaba anulado.");
        }
        UUID actor = CurrentActor.requireUserId();
        if (before.fromCash()) {
            UUID session = (UUID) em.createNativeQuery("SELECT cash_session_id FROM expenses WHERE id = ?1")
                    .setParameter(1, id).getSingleResult();
            String label = "Anulación del gasto #" + before.number() + " · " + before.categoryName();
            cash.recordExpenseVoidCash(session, before.amount(), id, label.substring(0, Math.min(255, label.length())));
        }
        Timestamp now = Timestamp.from(Instant.now());
        em.createNativeQuery("""
                UPDATE expenses SET status = 'VOID', void_reason = ?2, voided_by = ?3, voided_at = ?4, updated_at = ?4
                WHERE id = ?1""")
                .setParameter(1, id).setParameter(2, why).setParameter(3, actor).setParameter(4, now).executeUpdate();
        ExpenseView after = get(id);
        Map<String, Object> data = snapshot(after);
        data.put("reason", why);
        audit.log("EXPENSE_VOIDED", "expense", id, snapshot(before), data);
        return after;
    }

    // ------------------------------------------------------------------ soporte

    /** Guarda (o reemplaza) la foto o el PDF del soporte. Lo sube quien registró el gasto o quien administra gastos. */
    @Transactional
    public ExpenseView attach(UUID id, String fileName, byte[] content) {
        ExpenseView e = locked(id);
        UUID actor = CurrentActor.requireUserId();
        if (!CurrentActor.permissions().contains(MANAGE) && !actor.equals(e.createdBy())) {
            throw new ForbiddenException("Solo quien registró el gasto le agrega el soporte.");
        }
        if (!"ACTIVE".equals(e.status())) {
            throw new BusinessRuleException("Un gasto anulado no se modifica.");
        }
        if (content == null || content.length == 0) {
            throw new BusinessRuleException("El archivo está vacío.");
        }
        if (content.length > MAX_DOCUMENT_BYTES) {
            throw new BusinessRuleException("El soporte pesa más de 5 MB. Toma la foto con menos calidad o recórtala.");
        }
        String type = contentType(content);
        if (type == null) {
            throw new BusinessRuleException("El soporte debe ser una foto (JPG o PNG) o un PDF.");
        }
        String extension = type.equals("application/pdf") ? ".pdf" : type.equals("image/png") ? ".png" : ".jpg";
        String name = "gasto-" + e.number() + extension;
        em.createNativeQuery("""
                INSERT INTO expense_documents (expense_id, file_name, content_type, size_bytes, content, uploaded_by,
                    uploaded_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ON CONFLICT (expense_id) DO UPDATE SET file_name = EXCLUDED.file_name,
                    content_type = EXCLUDED.content_type, size_bytes = EXCLUDED.size_bytes, content = EXCLUDED.content,
                    uploaded_by = EXCLUDED.uploaded_by, uploaded_at = EXCLUDED.uploaded_at""")
                .setParameter(1, id).setParameter(2, name).setParameter(3, type).setParameter(4, content.length)
                .setParameter(5, content).setParameter(6, actor).setParameter(7, Timestamp.from(Instant.now()))
                .executeUpdate();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("number", e.number());
        data.put("file", name);
        data.put("originalName", clean(fileName, 160));
        data.put("bytes", content.length);
        audit.log("EXPENSE_DOCUMENT_ATTACHED", "expense", id, null, data);
        return get(id);
    }

    @Transactional(readOnly = true)
    public StoredFile document(UUID id) {
        List<?> found = em.createNativeQuery(
                "SELECT file_name, content_type, content FROM expense_documents WHERE expense_id = ?1")
                .setParameter(1, id).getResultList();
        if (found.isEmpty()) {
            throw new NotFoundException("Ese gasto no tiene soporte.");
        }
        Object[] r = (Object[]) found.getFirst();
        return new StoredFile((String) r[0], (String) r[1], (byte[]) r[2]);
    }

    /** Tipo real del archivo por sus primeros bytes (no se confía en el nombre ni en lo que diga el navegador). */
    static String contentType(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8 && (b[2] & 0xff) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xff) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return "image/png";
        }
        if (b.length >= 5 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F' && b[4] == '-') {
            return "application/pdf";
        }
        return null;
    }

    // ------------------------------------------------------------------ consultas

    @Transactional(readOnly = true)
    public ExpenseView get(UUID id) {
        Map<String, Object> params = new HashMap<>();
        params.put("zone", zone().getId());
        params.put("id", id);
        List<ExpenseView> rows = views(query(ALL + ROW + " WHERE x.id = :id", params).getResultList());
        if (rows.isEmpty()) {
            throw new NotFoundException("Gasto no encontrado.");
        }
        return rows.getFirst();
    }

    @Transactional(readOnly = true)
    public PageResponse<ExpenseView> list(Filter f, int page, int size) {
        int p = Math.max(0, page);
        int s = Math.min(Math.max(1, size), 100);
        Filter filter = normalize(f);
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, true);
        long total = ((Number) query(ALL + "SELECT count(*) FROM x" + where, params).getSingleResult()).longValue();
        List<ExpenseView> rows = views(query(ALL + ROW + where
                + " ORDER BY x.expense_date DESC, x.created_at DESC, x.id", params)
                .setFirstResult(p * s).setMaxResults(s).getResultList());
        return new PageResponse<>(rows, p, s, total, (int) Math.ceil(total / (double) s));
    }

    /** Totales de los gastos activos del filtro, por categoría y por medio de pago. */
    @Transactional(readOnly = true)
    public Summary summary(Filter f) {
        Filter filter = normalize(f);
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, false);
        Object[] t = (Object[]) query(ALL + """
                SELECT coalesce(sum(x.amount), 0), count(*),
                       coalesce(sum(x.amount) FILTER (WHERE x.cash_session_id IS NOT NULL), 0),
                       count(*) FILTER (WHERE x.unclassified),
                       coalesce(sum(x.amount) FILTER (WHERE x.unclassified), 0)
                FROM x""" + where, params).getSingleResult();
        List<CategoryTotal> byCategory = new ArrayList<>();
        for (Object row : query(ALL + """
                SELECT x.category_id, c.name, sum(x.amount), count(*)
                FROM x LEFT JOIN expense_categories c ON c.id = x.category_id""" + where
                + " GROUP BY x.category_id, c.name ORDER BY sum(x.amount) DESC, c.name", params).getResultList()) {
            Object[] r = (Object[]) row;
            byCategory.add(new CategoryTotal((UUID) r[0], r[1] == null ? UNCLASSIFIED : (String) r[1], money(r[2]),
                    ((Number) r[3]).longValue()));
        }
        List<MethodTotal> byMethod = new ArrayList<>();
        for (Object row : query(ALL + """
                SELECT x.payment_method_id, pm.name, sum(x.amount), count(*)
                FROM x LEFT JOIN payment_methods pm ON pm.id = x.payment_method_id""" + where
                + " GROUP BY x.payment_method_id, pm.name, pm.sort_order ORDER BY pm.sort_order, pm.name", params)
                .getResultList()) {
            Object[] r = (Object[]) row;
            byMethod.add(new MethodTotal((UUID) r[0], (String) r[1], money(r[2]), ((Number) r[3]).longValue()));
        }
        BigDecimal total = money(t[0]);
        BigDecimal cashTotal = money(t[2]);
        return new Summary(filter.from(), filter.to(), total, ((Number) t[1]).longValue(), cashTotal,
                total.subtract(cashTotal), ((Number) t[3]).longValue(), money(t[4]), byCategory, byMethod);
    }

    /** El listado del filtro para Excel (máximo {@value #MAX_EXPORT_ROWS} filas). */
    @Transactional(readOnly = true)
    public CsvWriter csv(Filter f) {
        Filter filter = normalize(f);
        Map<String, Object> params = new HashMap<>();
        String where = where(filter, params, true);
        List<ExpenseView> rows = views(query(ALL + ROW + where
                + " ORDER BY x.expense_date, x.created_at, x.id", params).setMaxResults(MAX_EXPORT_ROWS).getResultList());
        CsvWriter csv = new CsvWriter(zone());
        csv.row("Fecha", "Número", "Categoría", "Valor", "Medio de pago", "Salió de", "Sede", "Proveedor", "Nota",
                "Referencia", "Estado", "Registró", "Registrado");
        for (ExpenseView e : rows) {
            csv.row(e.date(), e.number(), e.categoryName(), e.amount(), e.paymentMethodName(),
                    e.fromCash() ? "Caja" : "Fuera de la caja", e.branchName(), e.supplierName(), e.note(),
                    e.reference(), "VOID".equals(e.status()) ? "Anulado" : "Activo", e.createdByName(), e.createdAt());
        }
        return csv;
    }

    public Filter normalize(Filter f) {
        LocalDate today = LocalDate.now(zone());
        LocalDate from = f.from() == null ? today.withDayOfMonth(1) : f.from();
        LocalDate to = f.to() == null ? (f.from() == null ? today : f.from().isAfter(today) ? f.from() : today) : f.to();
        if (from.isAfter(to)) {
            throw new BusinessRuleException("La fecha inicial no puede ser posterior a la final.");
        }
        String source = f.source() == null || f.source().isBlank() ? null : f.source().trim().toUpperCase(Locale.ROOT);
        if (source != null && !source.equals("CASH") && !source.equals("OTHER")) {
            throw new BusinessRuleException("Origen inválido: usa CASH u OTHER.");
        }
        return new Filter(from, to, f.categoryId(), f.branchId(), f.supplierId(), f.paymentMethodId(), source,
                f.unclassified(), f.includeVoided(), clean(f.text(), 100));
    }

    // ------------------------------------------------------------------ apoyo

    private String where(Filter f, Map<String, Object> params, boolean allowVoided) {
        StringBuilder where = new StringBuilder(" WHERE x.expense_date BETWEEN :from AND :to");
        params.put("zone", zone().getId());
        params.put("from", Date.valueOf(f.from()));
        params.put("to", Date.valueOf(f.to()));
        if (!allowVoided || !f.includeVoided()) {
            where.append(" AND x.status = 'ACTIVE'");
        }
        if (f.unclassified()) {
            where.append(" AND x.unclassified");
        }
        if (f.categoryId() != null) {
            where.append(" AND x.category_id = :category");
            params.put("category", f.categoryId());
        }
        if (f.branchId() != null) {
            where.append(" AND x.branch_id = :branch");
            params.put("branch", f.branchId());
        }
        if (f.supplierId() != null) {
            where.append(" AND x.supplier_id = :supplier");
            params.put("supplier", f.supplierId());
        }
        if (f.paymentMethodId() != null) {
            where.append(" AND x.payment_method_id = :method");
            params.put("method", f.paymentMethodId());
        }
        if ("CASH".equals(f.source())) {
            where.append(" AND x.cash_session_id IS NOT NULL");
        } else if ("OTHER".equals(f.source())) {
            where.append(" AND x.cash_session_id IS NULL");
        }
        if (f.text() != null) {
            where.append(" AND (x.note ILIKE :text ESCAPE '\\' OR x.reference ILIKE :text ESCAPE '\\')");
            params.put("text", "%" + f.text().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        return where.toString();
    }

    /** El gasto con su fila bloqueada (dos cambios a la vez no se pisan ni anulan dos veces). */
    private ExpenseView locked(UUID id) {
        if (em.createNativeQuery("SELECT id FROM expenses WHERE id = ?1 FOR UPDATE").setParameter(1, id)
                .getResultList().isEmpty()) {
            throw new NotFoundException("Gasto no encontrado.");
        }
        return get(id);
    }

    private List<ExpenseView> views(List<?> rows) {
        Set<UUID> people = new HashSet<>();
        for (Object row : rows) {
            people.add((UUID) ((Object[]) row)[20]);
        }
        Map<UUID, String> names = members.displayNames(people);
        List<ExpenseView> result = new ArrayList<>(rows.size());
        for (Object row : rows) {
            Object[] r = (Object[]) row;
            boolean unclassified = Boolean.TRUE.equals(r[18]);
            String supplier = r[7] == null ? null : (String) r[8];
            result.add(new ExpenseView((UUID) r[0], r[1] == null ? null : ((Number) r[1]).longValue(), date(r[2]),
                    (UUID) r[3], unclassified ? UNCLASSIFIED : (String) r[4], (UUID) r[5], (String) r[6], (UUID) r[7],
                    supplier, money(r[9]), (UUID) r[10], (String) r[11], r[12] != null, Boolean.TRUE.equals(r[13]),
                    (String) r[14], (String) r[15], (String) r[16], (String) r[17], unclassified,
                    Boolean.TRUE.equals(r[19]), (UUID) r[20], names.get((UUID) r[20]), instant(r[21])));
        }
        return result;
    }

    private static Map<String, Object> snapshot(ExpenseView e) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("number", e.number());
        data.put("date", e.date().toString());
        data.put("category", e.categoryName());
        data.put("amount", e.amount());
        data.put("method", e.paymentMethodName());
        data.put("fromCash", e.fromCash());
        data.put("branch", e.branchName());
        if (e.supplierName() != null) {
            data.put("supplier", e.supplierName());
        }
        if (e.note() != null) {
            data.put("note", e.note());
        }
        if (e.reference() != null) {
            data.put("reference", e.reference());
        }
        data.put("status", e.status());
        return data;
    }

    static BigDecimal amount(BigDecimal value) {
        if (value == null || value.signum() <= 0 || value.stripTrailingZeros().scale() > 2) {
            throw new BusinessRuleException("Escribe el valor del gasto.");
        }
        if (value.precision() - value.scale() > 12) {
            throw new BusinessRuleException("El valor del gasto es demasiado grande.");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    /** Nombre de la categoría. Una apagada solo sirve si el gasto ya la tenía. */
    String requireCategory(UUID categoryId, boolean requireActive) {
        if (categoryId == null) {
            throw new BusinessRuleException("Elige la categoría del gasto.");
        }
        List<?> found = em.createNativeQuery("SELECT name, active FROM expense_categories WHERE id = ?1")
                .setParameter(1, categoryId).getResultList();
        if (found.isEmpty()) {
            throw new BusinessRuleException("Elige la categoría del gasto.");
        }
        Object[] row = (Object[]) found.getFirst();
        if (requireActive && !Boolean.TRUE.equals(row[1])) {
            throw new BusinessRuleException("La categoría \"" + row[0] + "\" está apagada. Elige otra.");
        }
        return (String) row[0];
    }

    PaymentMethodRef requireMethod(UUID methodId) {
        PaymentMethodRef m = methodId == null ? null : cash.paymentMethods().get(methodId);
        if (m == null || !m.active() || NOT_FOR_EXPENSES.contains(m.code())) {
            throw new BusinessRuleException("Elige el medio con que pagaste (efectivo, transferencia…).");
        }
        return m;
    }

    void requireSupplier(UUID supplierId) {
        List<?> found = em.createNativeQuery("SELECT active FROM suppliers WHERE party_id = ?1")
                .setParameter(1, supplierId).getResultList();
        if (found.isEmpty()) {
            throw new BusinessRuleException("Proveedor no encontrado.");
        }
        if (!Boolean.TRUE.equals(found.getFirst())) {
            throw new BusinessRuleException("El proveedor está inactivo.");
        }
    }

    static String clean(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String v = value.trim();
        return v.substring(0, Math.min(max, v.length()));
    }

    private Query query(String sql, Map<String, Object> params) {
        Query q = em.createNativeQuery(sql);
        params.forEach(q::setParameter);
        return q;
    }

    ZoneId zone() {
        return ZoneId.of(settings.current().timezone());
    }

    static BigDecimal money(Object value) {
        return (value instanceof BigDecimal d ? d : new BigDecimal(String.valueOf(value))).setScale(2, RoundingMode.HALF_UP);
    }

    private static LocalDate date(Object value) {
        return value == null ? null : value instanceof Date d ? d.toLocalDate() : (LocalDate) value;
    }

    private static Instant instant(Object value) {
        return value instanceof Timestamp t ? t.toInstant() : (Instant) value;
    }
}
