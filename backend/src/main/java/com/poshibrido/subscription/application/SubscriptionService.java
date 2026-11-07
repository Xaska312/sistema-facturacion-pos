package com.poshibrido.subscription.application;

import com.poshibrido.audit.application.SecurityEvent;
import com.poshibrido.audit.application.SecurityEventLogger;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.shared.api.PageResponse;
import com.poshibrido.shared.error.ActivationCodeRequiredException;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import com.poshibrido.subscription.application.ActivationCodeService.Redeemed;
import com.poshibrido.subscription.application.SubscriptionViews.AddonView;
import com.poshibrido.subscription.application.SubscriptionViews.Entitled;
import com.poshibrido.subscription.application.SubscriptionViews.Extras;
import com.poshibrido.subscription.application.SubscriptionViews.PaymentView;
import com.poshibrido.subscription.application.SubscriptionViews.PlanView;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionRow;
import com.poshibrido.subscription.application.SubscriptionViews.SubscriptionView;
import com.poshibrido.subscription.application.SubscriptionViews.Usage;
import com.poshibrido.subscription.domain.BillingCycle;
import com.poshibrido.subscription.domain.SubscriptionStatus;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.domain.BusinessModule;
import com.poshibrido.tenancy.domain.PlanFeature;
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
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final SecurityEventLogger securityEvents;
    private final ConcurrentHashMap<UUID, Cached> cache = new ConcurrentHashMap<>();

    public SubscriptionService(DataSource dataSource, SubscriptionProperties properties, ActivationCodeService codes,
                               Mailer mailer, MailTemplates templates, SecurityEventLogger securityEvents) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.properties = properties;
        this.codes = codes;
        this.mailer = mailer;
        this.templates = templates;
        this.securityEvents = securityEvents;
    }

    /** Suscripción con su plan y los datos del negocio y del dueño. */
    record Current(UUID tenantId, String slug, String tradeName, String schema, String tenantStatus, String ownerEmail,
                   String ownerName, PlanView plan, boolean trial, BillingCycle cycle, Instant startedAt,
                   Instant endsAt, Extras extras, Instant priceLockedUntil, int aiInvoiceScans,
                   List<AddonView> addons, Instant aiTrialUsedAt, int aiTrialInvoiceScans) {

        SubscriptionStatus status(Duration grace, Instant now) {
            return SubscriptionStatus.of(trial, endsAt, grace, now);
        }

        /** Los extras cuentan mientras no tengan fecha de fin o no haya llegado. */
        boolean extrasActive(Instant now) {
            return extras.until() == null || extras.until().isAfter(now);
        }

        /** Lo comprado aparte que sigue vigente (decisión 302). */
        List<AddonView> activeAddons(Instant now) {
            return addons.stream().filter(a -> a.endsAt().isAfter(now)).toList();
        }

        /** XASKA IA solo por la prueba gratis (sin plan, extra ni compra que la incluya): topes de prueba. */
        boolean aiTrialOnly(Instant now) {
            boolean paid = plan.features().contains(PlanFeature.AI.name())
                    || (extrasActive(now) && extras.features().contains(PlanFeature.AI.name()))
                    || activeAddons(now).stream().anyMatch(a -> "AI".equals(a.ref()) && !a.trial());
            return !paid && activeAddons(now).stream().anyMatch(a -> "AI".equals(a.ref()) && a.trial());
        }

        Entitled entitled(Instant now) {
            boolean on = extrasActive(now);
            Set<String> modules = new java.util.LinkedHashSet<>(plan.modules());
            Set<String> features = new java.util.LinkedHashSet<>(plan.features());
            if (on) {
                modules.addAll(extras.modules());
                features.addAll(extras.features());
            }
            int branches = on ? extras.branches() : 0;
            int users = on ? extras.users() : 0;
            int registers = on ? extras.registers() : 0;
            for (AddonView a : activeAddons(now)) {
                switch (a.kind()) {
                    case "FEATURE" -> features.add(a.ref());
                    case "MODULE" -> modules.add(a.ref());
                    case "BRANCH" -> branches += a.quantity();
                    case "REGISTER" -> registers += a.quantity();
                    case "USER" -> users += a.quantity();
                    default -> { }
                }
            }
            int scans = !features.contains(PlanFeature.AI.name()) ? 0
                    : aiTrialOnly(now) ? aiTrialInvoiceScans : aiInvoiceScans + (on ? extras.invoiceScans() : 0);
            return new Entitled(plus(plan.maxBranches(), branches), plus(plan.maxUsers(), users),
                    plus(plan.maxRegisters(), registers),
                    csvList(BusinessModule.format(BusinessModule.parse(String.join(",", modules)))),
                    csvList(PlanFeature.format(PlanFeature.parse(String.join(",", features)))), scans);
        }

        private static Integer plus(Integer max, int extra) {
            return max == null ? null : max + extra;
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
    public void startForNewTenant(UUID tenantId, UUID ownerId, String activationCode, boolean payNow) {
        Instant now = Instant.now();
        if (activationCode == null || activationCode.isBlank()) {
            // Una prueba por cuenta (también si el primer negocio falló al crearse: se reintenta ese, con
            // retry-provisioning). Se bloquea la cuenta para que dos creaciones simultáneas no tomen dos pruebas.
            jdbc.queryForList("SELECT id FROM platform.users WHERE id = ? FOR UPDATE", ownerId);
            Boolean usedTrial = jdbc.queryForObject("""
                    SELECT EXISTS (SELECT 1 FROM platform.subscriptions s
                                   JOIN platform.tenants t ON t.id = s.tenant_id
                                   WHERE t.owner_user_id = ?)""", Boolean.class, ownerId);
            if (properties.trialWithoutCode() && !Boolean.TRUE.equals(usedTrial)) {
                // Aunque quiera pagar ya, usa la app con la prueba mientras se aprueba el pago (decisión 303).
                insert(tenantId, properties.trialPlan(), true, now, now.plus(properties.trial()));
                return;
            }
            if (payNow) {
                // Pagar para empezar (decisión 303): el negocio nace vencido; solo Planes y pagos hasta aprobar.
                insert(tenantId, properties.trialPlan(), true, now, now);
                return;
            }
            throw new ActivationCodeRequiredException(properties.trialWithoutCode()
                    ? "Ya usaste tu prueba gratis. Crea el negocio con \"Pagar ya\" o con un código de activación."
                    : "Para crear el negocio necesitas un código de activación, o elige \"Pagar ya\".");
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
            Integer max = c.entitled(Instant.now()).maxBranches();
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
            Integer max = c.entitled(Instant.now()).maxUsers();
            if (max != null && countUsers(c.tenantId(), c.schema()) >= max) {
                throw new BusinessRuleException("Tu plan " + c.plan().name() + " permite " + max
                        + " usuarios (contando las invitaciones pendientes). Para agregar otro, revoca una invitación,"
                        + " desactiva a alguien o cambia a un plan con más usuarios.");
            }
        });
    }

    @Override
    public Integer invoiceScansPerMonth(UUID tenantId) {
        return current(tenantId).map(c -> c.entitled(Instant.now()).maxInvoiceScans()).orElse(0);
    }

    @Override
    public int aiMonthlyLimit(UUID tenantId, String allowanceCode) {
        return current(tenantId).map(c -> {
            Entitled e = c.entitled(Instant.now());
            if (!e.features().contains(PlanFeature.AI.name())) {
                return 0;
            }
            if ("INVOICE_SCANS".equals(allowanceCode)) {
                return e.maxInvoiceScans();
            }
            String column = c.aiTrialOnly(Instant.now()) ? "trial_limit" : "monthly_limit";
            Integer limit = jdbc.query("SELECT " + column + " FROM platform.ai_allowances WHERE code = ?",
                    (rs, i) -> rs.getInt(1), allowanceCode).stream().findFirst().orElse(0);
            return limit;
        }).orElse(0);
    }

    @Override
    public void requireCanAddRegister(TenantRef tenant) {
        current(tenant.id()).ifPresent(c -> {
            Integer max = c.entitled(Instant.now()).maxRegisters();
            if (max != null && countRegisters(c.schema()) >= max) {
                throw new BusinessRuleException("Tu plan " + c.plan().name() + " permite " + max
                        + (max == 1 ? " caja activa" : " cajas activas")
                        + ". Para agregar otra, desactiva una o cambia a un plan con más cajas.");
            }
        });
    }

    @Override
    public Entitlements entitlements(UUID tenantId) {
        return current(tenantId).map(c -> {
            Entitled e = c.entitled(Instant.now());
            return new Entitlements(c.plan().name(), BusinessModule.parse(String.join(",", e.modules())),
                    PlanFeature.parse(String.join(",", e.features())));
        }).orElseGet(Entitlements::everything);
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
        Usage usage = provisioned ? new Usage(countBranches(c.schema()), countUsers(c.tenantId(), c.schema()),
                countRegisters(c.schema()), countInvoiceScans(c.schema())) : new Usage(0, 0, 0, 0);
        Extras x = c.extras();
        return new SubscriptionView(c.tenantId(), c.tradeName(), c.plan(), status, c.trial(), c.cycle(),
                c.startedAt(), c.endsAt(), c.trial() ? null : c.endsAt().plus(properties.grace()),
                daysLeft(c.endsAt(), now), usage, properties.paymentInstructions(),
                withPayments ? payments(tenantId) : List.of(), c.entitled(now),
                new Extras(x.modules(), x.features(), x.branches(), x.registers(), x.users(), x.note(), x.until(),
                        c.extrasActive(now), x.invoiceScans()), c.priceLockedUntil(),
                c.addons().stream().map(a -> new AddonView(a.code(), a.kind(), a.ref(), a.name(), a.quantity(),
                        a.endsAt(), a.trial(), a.endsAt().isAfter(now))).toList(),
                c.aiTrialUsedAt() == null && !c.entitled(now).features().contains(PlanFeature.AI.name()));
    }

    /** Vista del propio negocio: sin las notas internas que el administrador escribe en cada pago. */
    @Transactional(readOnly = true)
    public SubscriptionView viewForTenant(UUID tenantId, boolean withPayments) {
        SubscriptionView v = view(tenantId, withPayments);
        List<PaymentView> payments = v.payments().stream()
                .map(p -> new PaymentView(p.id(), p.planCode(), p.billingCycle(), p.periods(), p.amount(), p.method(),
                        p.reference(), null, p.periodStart(), p.periodEnd(), p.source(), p.createdAt()))
                .toList();
        Extras x = v.extras();
        // La nota de los extras es interna del administrador.
        return new SubscriptionView(v.tenantId(), v.tradeName(), v.plan(), v.status(), v.trial(), v.billingCycle(),
                v.startedAt(), v.endsAt(), v.graceEndsAt(), v.daysLeft(), v.usage(), v.paymentInstructions(),
                payments, v.entitled(), new Extras(x.modules(), x.features(), x.branches(), x.registers(), x.users(),
                        null, x.until(), x.active(), x.invoiceScans()), v.priceLockedUntil(), v.addons(),
                v.aiTrialAvailable());
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
                      JOIN platform.plans p ON p.code = s.plan_code
                      WHERE t.status <> 'DELETED') x
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

    /** Topes al mes de las funciones de XASKA IA (decisión 295). */
    @Transactional(readOnly = true)
    public List<SubscriptionViews.AiAllowance> aiAllowances() {
        return jdbc.query("SELECT code, name, monthly_limit FROM platform.ai_allowances ORDER BY code",
                (rs, i) -> new SubscriptionViews.AiAllowance(rs.getString("code"), rs.getString("name"),
                        rs.getInt("monthly_limit")));
    }

    @Transactional
    public SubscriptionViews.AiAllowance updateAiAllowance(String code, int monthlyLimit) {
        if (monthlyLimit < 0 || monthlyLimit > 100000) {
            throw new BusinessRuleException("El tope al mes va de 0 a 100.000.");
        }
        int updated = jdbc.update("UPDATE platform.ai_allowances SET monthly_limit = ?, updated_at = now() WHERE code = ?",
                monthlyLimit, code);
        if (updated == 0) {
            throw new NotFoundException("Función de XASKA IA no encontrada.");
        }
        afterCommit(cache::clear);
        return aiAllowances().stream().filter(a -> a.code().equals(code)).findFirst().orElseThrow();
    }

    @Transactional
    public PlanView updatePlan(String code, String name, Integer maxBranches, Integer maxUsers, Integer maxRegisters,
                               BigDecimal monthlyPrice, BigDecimal annualPrice, boolean active,
                               List<String> modules, List<String> features) {
        if (features != null && features.contains(PlanFeature.AI.name())) {
            throw new BusinessRuleException("XASKA IA es un adicional: dalo desde los extras de cada negocio.");
        }
        int updated = jdbc.update("""
                UPDATE platform.plans SET name = ?, max_branches = ?, max_users = ?, max_registers = ?,
                       monthly_price = ?, annual_price = ?, active = ?, modules = coalesce(?, modules),
                       features = coalesce(?, features), updated_at = now()
                WHERE code = ?""", name.trim(), maxBranches, maxUsers, maxRegisters, monthlyPrice, annualPrice, active,
                modules == null ? null : modulesCsv(modules), features == null ? null : featuresCsv(features), code);
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

    /**
     * Extras de un negocio (decisión 288): módulos, funciones, sedes, cajas y usuarios de más que el administrador le da
     * aunque su plan no los incluya, con una nota y una fecha de fin opcional. Queda en los eventos de seguridad.
     */
    @Transactional
    public SubscriptionView setExtras(UUID tenantId, List<String> modules, List<String> features, int branches,
                                      int registers, int users, int invoiceScans, String note, Instant until,
                                      UUID adminId) {
        if (branches < 0 || branches > 100 || registers < 0 || registers > 100 || users < 0 || users > 500) {
            throw new BusinessRuleException("Los extras van de 0 a 100 sedes o cajas y de 0 a 500 usuarios.");
        }
        if (invoiceScans < 0 || invoiceScans > 10000) {
            throw new BusinessRuleException("Las lecturas con IA de más van de 0 a 10.000 por mes.");
        }
        if (until != null && !until.isAfter(Instant.now())) {
            throw new BusinessRuleException("La fecha de fin de los extras debe ser futura (o vacía, sin fin).");
        }
        String mods = modulesCsv(modules);
        String feats = featuresCsv(features);
        String cleanNote = blankToNull(note);
        if (cleanNote != null && cleanNote.length() > 300) {
            throw new BusinessRuleException("La nota admite hasta 300 caracteres.");
        }
        int updated = jdbc.update("""
                UPDATE platform.subscriptions SET extra_modules = ?, extra_features = ?, extra_branches = ?,
                       extra_registers = ?, extra_users = ?, extra_invoice_scans = ?, extras_note = ?, extras_until = ?,
                       updated_at = now()
                WHERE tenant_id = ?""", mods, feats, branches, registers, users, invoiceScans, cleanNote,
                until == null ? null : Timestamp.from(until), tenantId);
        if (updated == 0) {
            throw new NotFoundException("El negocio no tiene suscripción.");
        }
        evict(tenantId);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("modules", mods);
        details.put("features", feats);
        details.put("branches", branches);
        details.put("registers", registers);
        details.put("users", users);
        details.put("invoiceScans", invoiceScans);
        details.put("until", until == null ? null : until.toString());
        details.put("note", cleanNote);
        securityEvents.record(SecurityEvent.SUBSCRIPTION_EXTRAS_CHANGED, adminId, null, tenantId, details);
        return view(tenantId, true);
    }

    private static String modulesCsv(List<String> codes) {
        Set<BusinessModule> set = EnumSet.noneOf(BusinessModule.class);
        for (String code : codes == null ? List.<String>of() : codes) {
            set.add(Arrays.stream(BusinessModule.values()).filter(m -> m.name().equals(code)).findFirst()
                    .orElseThrow(() -> new BusinessRuleException("Módulo desconocido: " + code)));
        }
        return BusinessModule.format(set);
    }

    private static String featuresCsv(List<String> codes) {
        Set<PlanFeature> set = EnumSet.noneOf(PlanFeature.class);
        for (String code : codes == null ? List.<String>of() : codes) {
            set.add(Arrays.stream(PlanFeature.values()).filter(f -> f.name().equals(code)).findFirst()
                    .orElseThrow(() -> new BusinessRuleException("Función desconocida: " + code)));
        }
        return PlanFeature.format(set);
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

    // ------------------------------------------------------------------ adicionales (decisión 302)

    static final int AI_TRIAL_DAYS = 14;

    /**
     * Suma {@code months} meses a un adicional del negocio (desde su vencimiento, o desde hoy si ya venció, no lo
     * tenía o lo tenía en prueba), con esa cantidad. Comprar deja de ser prueba.
     */
    @Transactional
    public void extendAddon(UUID tenantId, String code, int quantity, int months) {
        if (months < 1 || months > 36 || quantity < 1 || quantity > 100) {
            throw new BusinessRuleException("Revisa la cantidad y los meses del adicional.");
        }
        Instant now = Instant.now();
        Instant current = jdbc.query("""
                SELECT ends_at FROM platform.subscription_addons WHERE tenant_id = ? AND addon_code = ? AND NOT trial
                FOR UPDATE""", (rs, i) -> rs.getTimestamp(1).toInstant(), tenantId, code).stream().findFirst()
                .orElse(now);
        Instant end = plusMonths(current.isAfter(now) ? current : now, months);
        jdbc.update("""
                INSERT INTO platform.subscription_addons (tenant_id, addon_code, quantity, ends_at, trial, updated_at)
                VALUES (?, ?, ?, ?, FALSE, ?)
                ON CONFLICT (tenant_id, addon_code) DO UPDATE SET quantity = EXCLUDED.quantity,
                    ends_at = EXCLUDED.ends_at, trial = FALSE, updated_at = EXCLUDED.updated_at""",
                tenantId, code, quantity, Timestamp.from(end), Timestamp.from(now));
        evict(tenantId);
    }

    /** Prueba gratis de XASKA IA: una sola vez por negocio, {@value #AI_TRIAL_DAYS} días, con topes de prueba. */
    @Transactional
    public SubscriptionView startAiTrial(UUID tenantId) {
        Current c = load(tenantId).orElseThrow(() -> new NotFoundException("El negocio no tiene suscripción."));
        Instant now = Instant.now();
        if (c.aiTrialUsedAt() != null) {
            throw new BusinessRuleException("Este negocio ya usó su prueba gratis de XASKA IA.");
        }
        if (c.entitled(now).features().contains(PlanFeature.AI.name())) {
            throw new BusinessRuleException("Este negocio ya tiene XASKA IA.");
        }
        int marked = jdbc.update("""
                UPDATE platform.subscriptions SET ai_trial_used_at = ?, updated_at = now()
                WHERE tenant_id = ? AND ai_trial_used_at IS NULL""", Timestamp.from(now), tenantId);
        if (marked == 0) {
            throw new BusinessRuleException("Este negocio ya usó su prueba gratis de XASKA IA.");
        }
        jdbc.update("""
                INSERT INTO platform.subscription_addons (tenant_id, addon_code, quantity, ends_at, trial, updated_at)
                VALUES (?, 'AI', 1, ?, TRUE, ?)
                ON CONFLICT (tenant_id, addon_code) DO NOTHING""",
                tenantId, Timestamp.from(now.plus(Duration.ofDays(AI_TRIAL_DAYS))), Timestamp.from(now));
        evict(tenantId);
        return viewForTenant(tenantId, true);
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
                       p.max_users AS p_max_users, p.max_registers AS p_max_registers,
                       p.monthly_price AS p_monthly_price, p.annual_price AS p_annual_price, p.active AS p_active,
                       p.modules AS p_modules, p.features AS p_features, p.legacy AS p_legacy,
                       (SELECT monthly_limit FROM platform.ai_allowances WHERE code = 'INVOICE_SCANS') AS ai_invoice_scans,
                       (SELECT trial_limit FROM platform.ai_allowances WHERE code = 'INVOICE_SCANS') AS ai_trial_scans
                FROM platform.subscriptions s
                JOIN platform.tenants t ON t.id = s.tenant_id
                JOIN platform.users u ON u.id = t.owner_user_id
                JOIN platform.plans p ON p.code = s.plan_code
                WHERE s.tenant_id = ?""", (rs, i) -> new Current(rs.getObject("tenant_id", UUID.class),
                rs.getString("slug"), rs.getString("trade_name"), rs.getString("schema_name"),
                rs.getString("tenant_status"), rs.getString("email"), rs.getString("full_name"), plan(rs, "p_"),
                rs.getBoolean("trial"), BillingCycle.valueOf(rs.getString("billing_cycle")),
                rs.getTimestamp("started_at").toInstant(), rs.getTimestamp("ends_at").toInstant(),
                new Extras(csvList(rs.getString("extra_modules")), csvList(rs.getString("extra_features")),
                        rs.getInt("extra_branches"), rs.getInt("extra_registers"), rs.getInt("extra_users"),
                        rs.getString("extras_note"), instantOrNull(rs.getTimestamp("extras_until")), true,
                        rs.getInt("extra_invoice_scans")),
                instantOrNull(rs.getTimestamp("price_locked_until")), rs.getInt("ai_invoice_scans"),
                addons(tenantId), instantOrNull(rs.getTimestamp("ai_trial_used_at")), rs.getInt("ai_trial_scans")),
                tenantId).stream().findFirst();
    }

    private List<AddonView> addons(UUID tenantId) {
        return jdbc.query("""
                SELECT sa.addon_code, a.kind, a.ref, a.name, sa.quantity, sa.ends_at, sa.trial
                FROM platform.subscription_addons sa JOIN platform.addons a ON a.code = sa.addon_code
                WHERE sa.tenant_id = ? ORDER BY a.sort_order""", (rs, i) -> new AddonView(rs.getString(1),
                rs.getString(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getTimestamp(6).toInstant(),
                rs.getBoolean(7), true), tenantId);
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

    private long countRegisters(String schema) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM " + TenantSchemas.requireTenantSchema(schema)
                + ".cash_registers WHERE active", Long.class);
        return count == null ? 0 : count;
    }

    /** Facturas leídas con IA este mes (decisión 295; mes en hora de Colombia). */
    private long countInvoiceScans(String schema) {
        Long count = jdbc.queryForObject("SELECT count(*) FROM " + TenantSchemas.requireTenantSchema(schema)
                + ".purchase_invoice_scans WHERE status = 'OK' AND created_at >= "
                + "date_trunc('month', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'", Long.class);
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
                (Integer) rs.getObject(prefix + "max_registers"), rs.getBigDecimal(prefix + "monthly_price"),
                rs.getBigDecimal(prefix + "annual_price"), rs.getBoolean(prefix + "active"),
                csvList(rs.getString(prefix + "modules")), csvList(rs.getString(prefix + "features")),
                rs.getBoolean(prefix + "legacy"));
    }

    private static List<String> csvList(String csv) {
        return csv == null || csv.isBlank() ? List.of() : List.of(csv.split(","));
    }

    private static Instant instantOrNull(Timestamp t) {
        return t == null ? null : t.toInstant();
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

    /** Lo que ve quien crea un negocio: si el código es obligatorio y los días de la prueba sin código. */
    public SignupTerms signupTerms() {
        return new SignupTerms(!properties.trialWithoutCode(), properties.trialDays(), properties.trialWithoutCode());
    }

    /** Para esta cuenta: {@code trialAvailable} si su próximo negocio entra con prueba gratis (decisión 303). */
    public SignupTerms signupTerms(UUID ownerId) {
        Boolean used = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM platform.subscriptions s JOIN platform.tenants t ON t.id = s.tenant_id
                               WHERE t.owner_user_id = ?)""", Boolean.class, ownerId);
        return new SignupTerms(!properties.trialWithoutCode(), properties.trialDays(),
                properties.trialWithoutCode() && !Boolean.TRUE.equals(used));
    }

    /** {@code trialAvailable}: sin código, el negocio entra con la prueba gratis; si no, "Pagar ya" o un código. */
    public record SignupTerms(boolean activationCodeRequired, int trialDays, boolean trialAvailable) {
    }
}
