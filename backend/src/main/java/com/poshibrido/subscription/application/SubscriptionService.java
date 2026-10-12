package com.poshibrido.subscription.application;

import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.ActivationCodeRequiredException;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.subscription.application.ActivationCodeService.Redeemed;
import com.poshibrido.subscription.application.SubscriptionViews.PaymentView;
import com.poshibrido.subscription.application.SubscriptionViews.PlanView;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionRow;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionView;
import com.poshibrido.subscription.application.SubscriptionViews.Usage;
import com.poshibrido.subscription.domain.BillingCycle;
import com.poshibrido.subscription.domain.SubscriptionStatus;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.domain.TenantSchemas;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Suscripción de cada negocio ({@code platform.subscriptions}): prueba gratis o periodo pagado, límites del plan,
 * bloqueo de escritura al vencer y pagos registrados por el administrador de plataforma (sin pasarela).
 * La fila de cada negocio se guarda en caché 30 s; el estado se calcula con la hora actual en cada consulta, así el
 * vencimiento ocurre a tiempo sin tareas programadas.
 */
@Service
public class SubscriptionService implements SubscriptionApi {

    private static final Duration CACHE_TTL = Duration.ofSeconds(30);
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final JdbcTemplate jdbc;
    private final SubscriptionProperties properties;
    private final ActivationCodeService codes;
    private final Mailer mailer;
    private final MailTemplates templates;
    private final ConcurrentHashMap<UUID, Cached> cache = new ConcurrentHashMap<>();

    public SubscriptionService(DataSource dataSource, SubscriptionProperties properties, ActivationCodeService codes,
                               Mailer mailer, MailTemplates templates) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.properties = properties;
        this.codes = codes;
        this.mailer = mailer;
        this.templates = templates;
    }

    /** Suscripción con su plan y los datos del negocio y del dueño. */
    record Current(UUID tenantId, String slug, String tradeName, String schema, String tenantStatus, String ownerEmail,
                   String ownerName, PlanView plan, boolean trial, BillingCycle cycle, Instant startedAt,
                   Instant endsAt) {

        SubscriptionStatus status(Duration grace, Instant now) {
            return SubscriptionStatus.of(trial, endsAt, grace, now);
        }
    }

    private record Cached(Current current, Instant expiresAt) {
    }

    /** Pago registrado a mano por el administrador. {@code periods}: meses o años según el ciclo. */
    public record PaymentCommand(String planCode, BillingCycle billingCycle, int periods, BigDecimal amount,
                                 String method, String reference, String notes) {
    }

    // ------------------------------------------------------------------ SubscriptionApi

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void startForNewTenant(UUID tenantId, UUID ownerId, String activationCode) {
        Instant now = Instant.now();
        if (activationCode == null || activationCode.isBlank()) {
            // Una prueba por cuenta (también si el primer negocio falló al crearse: se reintenta ese, con
            // retry-provisioning). Se bloquea la cuenta para que dos creaciones simultáneas no tomen dos pruebas.
            jdbc.queryForList("SELECT id FROM platform.users WHERE id = ? FOR UPDATE", ownerId);
            Boolean usedTrial = jdbc.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM platform.subscriptions s
                                   JOIN platform.tenants t ON t.id = s.tenant_id
                                   WHERE t.owner_user_id = ?)""", Boolean.class, ownerId);
            if (Boolean.TRUE.equals(usedTrial)) {
                throw new ActivationCodeRequiredException();
            }
            insert(tenantId, properties.trialPlan(), true, now, now.plus(properties.trial()));
            return;
        }
        Redeemed code = codes.redeem(activationCode, ownerId, tenantId);
        Instant endsAt = plusMonths(now, code.months());
        insert(tenantId, code.planCode(), false, now, endsAt);
        jdbc.update("""
                INSERT INTO platform.subscription_payments (id, tenant_id, plan_code, billing_cycle, periods, amount,
                    method, reference, notes, period_start, period_end, source, registered_by, created_at)
                VALUES (?, ?, ?, 'MONTHLY', ?, 0, 'Código de activación', ?, NULL, ?, ?, 'CODE', ?, ?)""",
                Ids.newId(), tenantId, code.planCode(), code.months(), "…" + code.hint(), Timestamp.from(now),
                Timestamp.from(endsAt), ownerId, Timestamp.from(now));
    }

    /**
     * Al reintentar un negocio cuya creación falló, la prueba cuenta desde hoy (mientras estuvo en FAILED no se pudo
     * usar). Un plan pagado no cambia.
     */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void restartTrialOnRetry(UUID tenantId) {
        Instant now = Instant.now();
        jdbc.update("""
                UPDATE platform.subscriptions SET started_at = ?, ends_at = ?, updated_at = ?
                WHERE tenant_id = ? AND trial""",
                Timestamp.from(now), Timestamp.from(now.plus(properties.trial())), Timestamp.from(now), tenantId);
        evict(tenantId);
    }

    @Override
    public boolean blocksWrites(UUID tenantId) {
        return current(tenantId).map(c -> c.status(properties.grace(), Instant.now()).blocksWrites()).orElse(false);
    }

    @Override
    public void requireCanAddBranch(TenantRef tenant) {
        current(tenant.id()).ifPresent(c -> {
            Integer max = c.plan().maxBranches();
            if (max != null && countBranches(c.schema()) >= max) {
                throw new BusinessRuleException("Tu plan " + c.plan().name() + " permite " + max
                        + (max == 1 ? " sucursal activa" : " sucursales activas")
                        + ". Para agregar otra, cambia a un plan con más sucursales.");
            }
        });
    }

    @Override
    public void requireCanAddUser(TenantRef tenant) {
        current(tenant.id()).ifPresent(c -> {
            Integer max = c.plan().maxUsers();
            if (max != null && countUsers(c.tenantId(), c.schema()) >= max) {
                throw new BusinessRuleException("Tu plan " + c.plan().name() + " permite " + max
                        + " usuarios (contando las invitaciones pendientes). Para agregar otro, revoca una invitación,"
                        + " desactiva a alguien o cambia a un plan con más usuarios.");
            }
        });
    }

    // ------------------------------------------------------------------ consultas

    /** Suscripción del negocio. Los pagos solo si {@code withPayments}. */
    @Transactional(readOnly = true)
    public SubscriptionView view(UUID tenantId, boolean withPayments) {
        Current c = load(tenantId).orElseThrow(() -> new NotFoundException("El negocio no tiene suscripción."));
        Instant now = Instant.now();
        SubscriptionStatus status = c.status(properties.grace(), now);
        // Un negocio que no terminó de crearse no tiene schema: sin uso que contar.
        boolean provisioned = "ACTIVE".equals(c.tenantStatus()) || "SUSPENDED".equals(c.tenantStatus());
        Usage usage = provisioned ? new Usage(countBranches(c.schema()), countUsers(c.tenantId(), c.schema()))
                : new Usage(0, 0);
        return new SubscriptionView(c.tenantId(), c.tradeName(), c.plan(), status, c.trial(), c.cycle(),
                c.startedAt(), c.endsAt(), c.trial() ? null : c.endsAt().plus(properties.grace()),
                daysLeft(c.endsAt(), now), usage, properties.paymentInstructions(),
                withPayments ? payments(tenantId) : List.of());
    }

    /** Vista del propio negocio: sin las notas internas que el administrador escribe en cada pago. */
    @Transactional(readOnly = true)
    public SubscriptionView viewForTenant(UUID tenantId, boolean withPayments) {
        SubscriptionView v = view(tenantId, withPayments);
        List<PaymentView> payments = v.payments().stream()
                .map(p -> new PaymentView(p.id(), p.planCode(), p.billingCycle(), p.periods(), p.amount(), p.method(),
                        p.reference(), null, p.periodStart(), p.periodEnd(), p.source(), p.createdAt()))
                .toList();
        return new SubscriptionView(v.tenantId(), v.tradeName(), v.plan(), v.status(), v.trial(), v.billingCycle(),
                v.startedAt(), v.endsAt(), v.graceEndsAt(), v.daysLeft(), v.usage(), v.paymentInstructions(),
                payments);
    }

    @Transactional(readOnly = true)
    public PageResponse<SubscriptionRow> list(String query, SubscriptionStatus status, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 100);
        int safePage = Math.max(page, 0);
        String like = query == null || query.isBlank() ? null
                : "%" + escapeLike(query.trim().toLowerCase(Locale.ROOT)) + "%";
        String statusName = status == null ? null : status.name();
        String from = """
                FROM (SELECT s.*, t.slug, t.trade_name, t.status AS tenant_status, u.email, u.full_name,
                             p.name AS plan_name,
                             CASE WHEN s.ends_at > now() THEN CASE WHEN s.trial THEN 'TRIAL' ELSE 'ACTIVE' END
                                  WHEN NOT s.trial AND s.ends_at + make_interval(days => ?) > now() THEN 'PAST_DUE'
                                  ELSE 'EXPIRED' END AS effective
                      FROM platform.subscriptions s
                      JOIN platform.tenants t ON t.id = s.tenant_id
                      JOIN platform.users u ON u.id = t.owner_user_id
                      JOIN platform.plans p ON p.code = s.plan_code) x
                WHERE (CAST(? AS VARCHAR) IS NULL OR x.effective = CAST(? AS VARCHAR))
                  AND (CAST(? AS VARCHAR) IS NULL OR lower(x.trade_name) LIKE CAST(? AS VARCHAR) ESCAPE '\\'
                       OR lower(x.slug) LIKE CAST(? AS VARCHAR) ESCAPE '\\'
                       OR lower(x.email) LIKE CAST(? AS VARCHAR) ESCAPE '\\')""";
        Object[] params = {properties.graceDays(), statusName, statusName, like, like, like, like};
        Long total = jdbc.queryForObject("SELECT count(*) " + from, Long.class, params);
        Instant now = Instant.now();
        List<SubscriptionRow> rows = jdbc.query("SELECT x.* " + from + " ORDER BY x.ends_at, x.trade_name LIMIT ? OFFSET ?",
                (rs, i) -> {
                    Instant endsAt = rs.getTimestamp("ends_at").toInstant();
                    boolean trial = rs.getBoolean("trial");
                    return new SubscriptionRow(rs.getObject("tenant_id", UUID.class), rs.getString("slug"),
                            rs.getString("trade_name"), rs.getString("tenant_status"), rs.getString("email"),
                            rs.getString("full_name"), rs.getString("plan_code"), rs.getString("plan_name"),
                            SubscriptionStatus.of(trial, endsAt, properties.grace(), now), trial, endsAt,
                            daysLeft(endsAt, now));
                }, append(params, safeSize, (long) safePage * safeSize));
        long totalElements = total == null ? 0 : total;
        return new PageResponse<>(rows, safePage, safeSize, totalElements,
                (int) ((totalElements + safeSize - 1) / safeSize));
    }

    @Transactional(readOnly = true)
    public List<PlanView> plans() {
        return jdbc.query("SELECT * FROM platform.plans ORDER BY sort_order, code", (rs, i) -> plan(rs, ""));
    }

    // ------------------------------------------------------------------ administración (consola de plataforma)

    @Transactional
    public PlanView updatePlan(String code, String name, Integer maxBranches, Integer maxUsers,
                               BigDecimal monthlyPrice, BigDecimal annualPrice, boolean active) {
        int updated = jdbc.update("""
                UPDATE platform.plans SET name = ?, max_branches = ?, max_users = ?, monthly_price = ?,
                       annual_price = ?, active = ?, updated_at = now()
                WHERE code = ?""", name.trim(), maxBranches, maxUsers, monthlyPrice, annualPrice, active, code);
        if (updated == 0) {
            throw new NotFoundException("Plan no encontrado.");
        }
        afterCommit(cache::clear);
        return plans().stream().filter(p -> p.code().equals(code)).findFirst().orElseThrow();
    }

    /**
     * Registra un pago: el periodo empieza al terminar el vigente (o hoy, si ya venció) y dura {@code periods} meses
     * o años. Pasa a plan pagado con el plan indicado y avisa al dueño por correo.
     */
    @Transactional
    public SubscriptionView registerPayment(UUID tenantId, PaymentCommand c, UUID adminId) {
        if (c.periods() < 1 || c.periods() > (c.billingCycle() == BillingCycle.ANNUAL ? 3 : 36)) {
            throw new BusinessRuleException(c.billingCycle() == BillingCycle.ANNUAL
                    ? "Se registran de 1 a 3 años por pago." : "Se registran de 1 a 36 meses por pago.");
        }
        requireActivePlan(c.planCode());
        List<Instant> locked = jdbc.query(
                "SELECT ends_at FROM platform.subscriptions WHERE tenant_id = ? FOR UPDATE",
                (rs, i) -> rs.getTimestamp("ends_at").toInstant(), tenantId);
        if (locked.isEmpty()) {
            throw new NotFoundException("El negocio no tiene suscripción.");
        }
        Instant now = Instant.now();
        Instant start = locked.getFirst().isAfter(now) ? locked.getFirst() : now;
        Instant end = plusMonths(start, c.periods() * c.billingCycle().months());
        jdbc.update("""
                UPDATE platform.subscriptions SET plan_code = ?, trial = FALSE, billing_cycle = ?, ends_at = ?,
                       updated_at = now()
                WHERE tenant_id = ?""", c.planCode(), c.billingCycle().name(), Timestamp.from(end), tenantId);
        jdbc.update("""
                INSERT INTO platform.subscription_payments (id, tenant_id, plan_code, billing_cycle, periods, amount,
                    method, reference, notes, period_start, period_end, source, registered_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAYMENT', ?, ?)""",
                Ids.newId(), tenantId, c.planCode(), c.billingCycle().name(), c.periods(), c.amount(),
                c.method().trim(), blankToNull(c.reference()), blankToNull(c.notes()), Timestamp.from(start),
                Timestamp.from(end), adminId, Timestamp.from(now));
        evict(tenantId);
        Current updated = load(tenantId).orElseThrow();
        mailer.send(templates.subscriptionPaid(updated.ownerEmail(), updated.ownerName(), updated.tradeName(),
                updated.plan().name(), end));
        return view(tenantId, true);
    }

    /** Cambia el plan sin cambiar la fecha de fin (p. ej. pasar a Pro a mitad de mes). */
    @Transactional
    public SubscriptionView changePlan(UUID tenantId, String planCode) {
        requireActivePlan(planCode);
        int updated = jdbc.update("UPDATE platform.subscriptions SET plan_code = ?, updated_at = now() WHERE tenant_id = ?",
                planCode, tenantId);
        if (updated == 0) {
            throw new NotFoundException("El negocio no tiene suscripción.");
        }
        evict(tenantId);
        return view(tenantId, true);
    }

    /**
     * Saca el negocio de la caché. Dentro de una transacción, también después de confirmarla: si no, una petición
     * que llegue entre el cambio y el commit volvería a guardar el estado anterior por 30 s.
     */
    public void evict(UUID tenantId) {
        cache.remove(tenantId);
        afterCommit(() -> cache.remove(tenantId));
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    // ------------------------------------------------------------------ apoyo

    Optional<Current> current(UUID tenantId) {
        Instant now = Instant.now();
        Cached cached = cache.get(tenantId);
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return Optional.ofNullable(cached.current());
        }
        Optional<Current> loaded = load(tenantId);
        cache.put(tenantId, new Cached(loaded.orElse(null), now.plus(CACHE_TTL)));
        return loaded;
    }

    Optional<Current> load(UUID tenantId) {
        return jdbc.query("""
                SELECT s.*, t.slug, t.trade_name, t.schema_name, t.status AS tenant_status, u.email, u.full_name,
                       p.code AS p_code, p.name AS p_name, p.max_branches AS p_max_branches,
                       p.max_users AS p_max_users, p.monthly_price AS p_monthly_price,
                       p.annual_price AS p_annual_price, p.active AS p_active
                FROM platform.subscriptions s
                JOIN platform.tenants t ON t.id = s.tenant_id
                JOIN platform.users u ON u.id = t.owner_user_id
                JOIN platform.plans p ON p.code = s.plan_code
                WHERE s.tenant_id = ?""", (rs, i) -> new Current(rs.getObject("tenant_id", UUID.class),
                rs.getString("slug"), rs.getString("trade_name"), rs.getString("schema_name"),
                rs.getString("tenant_status"), rs.getString("email"), rs.getString("full_name"), plan(rs, "p_"),
                rs.getBoolean("trial"), BillingCycle.valueOf(rs.getString("billing_cycle")),
                rs.getTimestamp("started_at").toInstant(), rs.getTimestamp("ends_at").toInstant()), tenantId)
                .stream().findFirst();
    }

    private List<PaymentView> payments(UUID tenantId) {
        return jdbc.query("""
                SELECT * FROM platform.subscription_payments WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100""",
                (rs, i) -> new PaymentView(rs.getObject("id", UUID.class), rs.getString("plan_code"),
                        BillingCycle.valueOf(rs.getString("billing_cycle")), rs.getInt("periods"),
                        rs.getBigDecimal("amount"), rs.getString("method"), rs.getString("reference"),
                        rs.getString("notes"), rs.getTimestamp("period_start").toInstant(),
                        rs.getTimestamp("period_end").toInstant(), rs.getString("source"),
                        rs.getTimestamp("created_at").toInstant()), tenantId);
    }

    private void insert(UUID tenantId, String planCode, boolean trial, Instant start, Instant end) {
        jdbc.update("""
                INSERT INTO platform.subscriptions (tenant_id, plan_code, trial, billing_cycle, started_at, ends_at,
                                                    updated_at)
                VALUES (?, ?, ?, 'MONTHLY', ?, ?, ?)""",
                tenantId, planCode, trial, Timestamp.from(start), Timestamp.from(end), Timestamp.from(start));
        evict(tenantId);
    }

    private long countBranches(String schema) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM " + TenantSchemas.requireTenantSchema(schema)
                + ".branches WHERE active", Long.class);
        return count == null ? 0 : count;
    }

    /** Miembros activos más invitaciones pendientes vigentes (al aceptarlas serán usuarios). */
    private long countUsers(UUID tenantId, String schema) {
        Long members = jdbc.queryForObject("SELECT count(*) FROM " + TenantSchemas.requireTenantSchema(schema)
                + ".members WHERE active", Long.class);
        Long pending = jdbc.queryForObject("""
                SELECT count(*) FROM platform.invitations
                WHERE tenant_id = ? AND status = 'PENDING' AND expires_at > now()""", Long.class, tenantId);
        return (members == null ? 0 : members) + (pending == null ? 0 : pending);
    }

    private void requireActivePlan(String planCode) {
        Integer found = jdbc.queryForObject("SELECT count(*) FROM platform.plans WHERE code = ? AND active",
                Integer.class, planCode);
        if (found == null || found == 0) {
            throw new BusinessRuleException("El plan " + planCode + " no existe o no está activo.");
        }
    }

    private static PlanView plan(ResultSet rs, String prefix) throws SQLException {
        return new PlanView(rs.getString(prefix + "code"), rs.getString(prefix + "name"),
                (Integer) rs.getObject(prefix + "max_branches"), (Integer) rs.getObject(prefix + "max_users"),
                rs.getBigDecimal(prefix + "monthly_price"), rs.getBigDecimal(prefix + "annual_price"),
                rs.getBoolean(prefix + "active"));
    }

    static long daysLeft(Instant endsAt, Instant now) {
        if (!endsAt.isAfter(now)) {
            return 0;
        }
        long seconds = Duration.between(now, endsAt).getSeconds();
        return (seconds + 86_399) / 86_400;
    }

    private static Instant plusMonths(Instant from, int months) {
        return from.atZone(BOGOTA).plusMonths(months).toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static Object[] append(Object[] params, Object... more) {
        Object[] all = new Object[params.length + more.length];
        System.arraycopy(params, 0, all, 0, params.length);
        System.arraycopy(more, 0, all, params.length, more.length);
        return all;
    }
}
