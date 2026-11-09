package com.poshibrido.subscription.application;

import com.poshibrido.mail.MailProperties;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.shared.error.BusinessRuleException;
import com.poshibrido.shared.error.NotFoundException;
import com.poshibrido.shared.id.Ids;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Referidos y aliados (decisión 312). Cada negocio tiene un código para invitar; los contadores y distribuidores
 * (aliados) tienen el suyo, que crea el administrador. El negocio que se registra con un código tiene XASKA IA durante
 * toda su prueba gratis; el referido cuenta cuando paga su primer mes: el negocio que invitó gana un mes de XASKA IA y
 * el aliado el 20 % de ese primer pago, que el administrador le paga por Bre-B y marca en la Consola.
 */
@Service
public class ReferralService {

    /** Comisión del aliado sobre el primer pago del negocio que trajo. */
    static final BigDecimal COMMISSION = new BigDecimal("0.20");
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final SubscriptionService subscriptions;
    private final MailTemplates templates;
    private final MailProperties mail;
    private final Mailer mailer;

    public ReferralService(DataSource dataSource, SubscriptionService subscriptions, MailTemplates templates,
                           MailProperties mail, Mailer mailer) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.subscriptions = subscriptions;
        this.templates = templates;
        this.mail = mail;
        this.mailer = mailer;
    }

    public record Invited(String tradeName, String status, Instant createdAt, Instant qualifiedAt) {
    }

    /** Lo que ve el dueño en "Invita y gana": su código, el enlace y a quién invitó. */
    public record Mine(String code, String link, int invited, int paid, int monthsEarned, List<Invited> list) {
    }

    public record Partner(UUID id, String name, String kind, String phone, String email, String payoutKey, String note,
                          boolean active, String code, int referred, int paid, BigDecimal commissionOwed) {
    }

    public record PartnerInput(String name, String kind, String phone, String email, String payoutKey, String note,
                               boolean active) {
    }

    public record Row(UUID referredTenantId, String referredName, String code, String referrerName, String partnerName,
                      String partnerPayoutKey, String status, Instant createdAt, Instant qualifiedAt,
                      BigDecimal firstAmount, BigDecimal commission, Instant paidAt, String paidReference) {
    }

    // ------------------------------------------------------------------ negocio

    @Transactional
    public Mine mine(UUID tenantId) {
        String code = codeFor(tenantId);
        List<Invited> list = jdbc.query("""
                SELECT t.trade_name, r.status, r.created_at, r.qualified_at FROM platform.referrals r
                JOIN platform.tenants t ON t.id = r.referred_tenant_id
                WHERE r.referrer_tenant_id = ? ORDER BY r.created_at DESC LIMIT 50""",
                (rs, i) -> new Invited(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant(),
                        rs.getTimestamp(4) == null ? null : rs.getTimestamp(4).toInstant()), tenantId);
        int paid = (int) list.stream().filter(r -> "QUALIFIED".equals(r.status())).count();
        return new Mine(code, link(code), list.size(), paid, paid, list);
    }

    String link(String code) {
        return mail.link("/registro?ref=" + code);
    }

    private String codeFor(UUID tenantId) {
        List<String> existing = jdbc.queryForList(
                "SELECT code FROM platform.referral_codes WHERE tenant_id = ?", String.class, tenantId);
        if (!existing.isEmpty()) {
            return existing.getFirst();
        }
        String name = jdbc.queryForObject("SELECT trade_name FROM platform.tenants WHERE id = ?", String.class, tenantId);
        return insertCode(name, tenantId, null);
    }

    private String insertCode(String name, UUID tenantId, UUID partnerId) {
        for (int attempt = 0; attempt < 8; attempt++) {
            String code = newCode(name);
            try {
                jdbc.update("""
                        INSERT INTO platform.referral_codes (code, tenant_id, partner_id, created_at) VALUES (?, ?, ?, ?)""",
                        code, tenantId, partnerId, Timestamp.from(Instant.now()));
                return code;
            } catch (DuplicateKeyException ex) {
                // Otro código igual (o el mismo negocio al tiempo): se intenta de nuevo.
                if (tenantId != null) {
                    List<String> mine = jdbc.queryForList(
                            "SELECT code FROM platform.referral_codes WHERE tenant_id = ?", String.class, tenantId);
                    if (!mine.isEmpty()) {
                        return mine.getFirst();
                    }
                }
            }
        }
        throw new IllegalStateException("No se pudo crear el código de invitación.");
    }

    /** "ESQUIN-7KQ": hasta 6 letras del nombre, sin tildes, y 3 al azar (sin 0, O, 1, I). */
    static String newCode(String name) {
        String base = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (base.length() < 3) {
            base = "XASKA";
        }
        StringBuilder code = new StringBuilder(base.substring(0, Math.min(6, base.length()))).append('-');
        for (int i = 0; i < 3; i++) {
            code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    static String normalize(String code) {
        return code == null ? "" : code.trim().toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    // ------------------------------------------------------------------ registro

    /**
     * Al crear el negocio con un código: queda como referido (pendiente) y, si arranca en prueba gratis, tiene XASKA IA
     * todos esos días (cuenta como su prueba de XASKA IA). Un código que no existe, de un aliado inactivo o de un
     * negocio del mismo dueño se rechaza y el negocio no se crea.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void attach(UUID tenantId, UUID ownerId, String rawCode) {
        String code = normalize(rawCode);
        if (code.isEmpty()) {
            return;
        }
        var found = jdbc.query("""
                SELECT c.tenant_id, c.partner_id, t.owner_user_id, p.active FROM platform.referral_codes c
                LEFT JOIN platform.tenants t ON t.id = c.tenant_id
                LEFT JOIN platform.partners p ON p.id = c.partner_id
                WHERE c.code = ?""", (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
                rs.getObject(3, UUID.class), rs.getObject(4)}, code);
        if (found.isEmpty() || (found.getFirst()[1] != null && !Boolean.TRUE.equals(found.getFirst()[3]))) {
            throw new BusinessRuleException("No encontramos el código de invitación " + code
                    + ". Revísalo o deja el campo vacío.");
        }
        Object[] f = found.getFirst();
        if (f[0] != null && ownerId.equals(f[2])) {
            throw new BusinessRuleException("Ese código es de un negocio tuyo: no cuenta como invitación.");
        }
        Instant now = Instant.now();
        jdbc.update("""
                INSERT INTO platform.referrals (referred_tenant_id, code, referrer_tenant_id, partner_id, status, created_at)
                VALUES (?, ?, ?, ?, 'PENDING', ?)""", tenantId, code, f[0], f[1], Timestamp.from(now));
        // Llega invitado: XASKA IA durante toda su prueba gratis (y esa es su prueba de XASKA IA).
        List<Timestamp> trialEnds = jdbc.queryForList("""
                SELECT ends_at FROM platform.subscriptions WHERE tenant_id = ? AND trial AND ends_at > now()""",
                Timestamp.class, tenantId);
        if (!trialEnds.isEmpty()) {
            jdbc.update("""
                    INSERT INTO platform.subscription_addons (tenant_id, addon_code, quantity, ends_at, trial, updated_at)
                    VALUES (?, 'AI', 1, ?, TRUE, ?) ON CONFLICT (tenant_id, addon_code) DO NOTHING""",
                    tenantId, trialEnds.getFirst(), Timestamp.from(now));
            jdbc.update("""
                    UPDATE platform.subscriptions SET ai_trial_used_at = ? WHERE tenant_id = ? AND ai_trial_used_at IS NULL""",
                    Timestamp.from(now), tenantId);
            subscriptions.evict(tenantId);
        }
    }

    // ------------------------------------------------------------------ pago

    /** El primer pago del plan de un referido: cuenta, y quien invitó gana su premio. */
    @EventListener
    public void onPaid(SubscriptionPaid paid) {
        var pending = jdbc.query("""
                SELECT referrer_tenant_id, partner_id FROM platform.referrals
                WHERE referred_tenant_id = ? AND status = 'PENDING' FOR UPDATE""",
                (rs, i) -> new UUID[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class)}, paid.tenantId());
        if (pending.isEmpty()) {
            return;
        }
        UUID referrer = pending.getFirst()[0];
        UUID partner = pending.getFirst()[1];
        BigDecimal commission = partner == null ? null : commission(paid.amount());
        jdbc.update("""
                UPDATE platform.referrals SET status = 'QUALIFIED', qualified_at = ?, first_amount = ?, commission = ?
                WHERE referred_tenant_id = ?""", Timestamp.from(Instant.now()), paid.amount(), commission, paid.tenantId());
        if (referrer != null) {
            Instant until = giveAiMonth(referrer);
            String referredName = jdbc.queryForObject(
                    "SELECT trade_name FROM platform.tenants WHERE id = ?", String.class, paid.tenantId());
            jdbc.query("""
                    SELECT u.email, u.full_name, t.trade_name FROM platform.tenants t
                    JOIN platform.users u ON u.id = t.owner_user_id WHERE t.id = ?""", rs -> {
                mailer.send(templates.referralReward(rs.getString(1), firstName(rs.getString(2)), rs.getString(3),
                        referredName, DateTimeFormatter.ofPattern("d 'de' MMMM 'de' yyyy", Locale.forLanguageTag("es-CO"))
                                .format(until.atZone(BOGOTA))));
            }, referrer);
        }
    }

    static BigDecimal commission(BigDecimal amount) {
        return amount.multiply(COMMISSION).setScale(0, RoundingMode.HALF_UP);
    }

    /** Un mes más de XASKA IA desde lo que ya tenga (también si estaba en prueba); queda como pagada. */
    private Instant giveAiMonth(UUID tenantId) {
        Instant now = Instant.now();
        Instant current = jdbc.query("""
                SELECT ends_at FROM platform.subscription_addons WHERE tenant_id = ? AND addon_code = 'AI' FOR UPDATE""",
                (rs, i) -> rs.getTimestamp(1).toInstant(), tenantId).stream().findFirst().orElse(now);
        Instant end = SubscriptionService.plusMonths(current.isAfter(now) ? current : now, 1);
        jdbc.update("""
                INSERT INTO platform.subscription_addons (tenant_id, addon_code, quantity, ends_at, trial, updated_at)
                VALUES (?, 'AI', 1, ?, FALSE, ?)
                ON CONFLICT (tenant_id, addon_code) DO UPDATE SET ends_at = EXCLUDED.ends_at, trial = FALSE,
                    updated_at = EXCLUDED.updated_at""", tenantId, Timestamp.from(end), Timestamp.from(now));
        subscriptions.evict(tenantId);
        return end;
    }

    private static String firstName(String name) {
        return name == null || name.isBlank() ? "" : name.trim().split("\\s+")[0];
    }

    // ------------------------------------------------------------------ consola

    public List<Partner> partners() {
        return jdbc.query("""
                SELECT p.*, c.code,
                       (SELECT count(*) FROM platform.referrals r WHERE r.partner_id = p.id) AS referred,
                       (SELECT count(*) FROM platform.referrals r WHERE r.partner_id = p.id AND r.status = 'QUALIFIED') AS paid,
                       (SELECT coalesce(sum(r.commission), 0) FROM platform.referrals r
                        WHERE r.partner_id = p.id AND r.status = 'QUALIFIED' AND r.paid_at IS NULL) AS owed
                FROM platform.partners p LEFT JOIN platform.referral_codes c ON c.partner_id = p.id
                ORDER BY p.active DESC, p.name""", (rs, i) -> new Partner(rs.getObject("id", UUID.class),
                rs.getString("name"), rs.getString("kind"), rs.getString("phone"), rs.getString("email"),
                rs.getString("payout_key"), rs.getString("note"), rs.getBoolean("active"), rs.getString("code"),
                rs.getInt("referred"), rs.getInt("paid"), rs.getBigDecimal("owed")));
    }

    @Transactional
    public Partner savePartner(UUID id, PartnerInput in, UUID adminId) {
        String name = in.name() == null ? "" : in.name().trim();
        if (name.isEmpty()) {
            throw new BusinessRuleException("Escribe el nombre del aliado.");
        }
        if (!"ACCOUNTANT".equals(in.kind()) && !"DISTRIBUTOR".equals(in.kind())) {
            throw new BusinessRuleException("Elige si es contador o distribuidor.");
        }
        UUID partnerId = id;
        if (id == null) {
            partnerId = Ids.newId();
            jdbc.update("""
                    INSERT INTO platform.partners (id, name, kind, phone, email, payout_key, note, active, created_at,
                        created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""", partnerId, name, in.kind(), blank(in.phone()),
                    blank(in.email()), blank(in.payoutKey()), blank(in.note()), in.active(),
                    Timestamp.from(Instant.now()), adminId);
            insertCode(name, null, partnerId);
        } else if (jdbc.update("""
                UPDATE platform.partners SET name = ?, kind = ?, phone = ?, email = ?, payout_key = ?, note = ?, active = ?
                WHERE id = ?""", name, in.kind(), blank(in.phone()), blank(in.email()), blank(in.payoutKey()),
                blank(in.note()), in.active(), id) == 0) {
            throw new NotFoundException("No existe ese aliado.");
        }
        UUID wanted = partnerId;
        return partners().stream().filter(p -> p.id().equals(wanted)).findFirst().orElseThrow();
    }

    public List<Row> referrals() {
        return jdbc.query("""
                SELECT r.*, t.trade_name AS referred_name, rt.trade_name AS referrer_name, p.name AS partner_name,
                       p.payout_key FROM platform.referrals r
                JOIN platform.tenants t ON t.id = r.referred_tenant_id
                LEFT JOIN platform.tenants rt ON rt.id = r.referrer_tenant_id
                LEFT JOIN platform.partners p ON p.id = r.partner_id
                ORDER BY (r.status = 'QUALIFIED' AND r.partner_id IS NOT NULL AND r.paid_at IS NULL) DESC,
                         r.created_at DESC LIMIT 300""", (rs, i) -> new Row(rs.getObject("referred_tenant_id", UUID.class),
                rs.getString("referred_name"), rs.getString("code"), rs.getString("referrer_name"),
                rs.getString("partner_name"), rs.getString("payout_key"), rs.getString("status"),
                rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("qualified_at") == null ? null : rs.getTimestamp("qualified_at").toInstant(),
                rs.getBigDecimal("first_amount"), rs.getBigDecimal("commission"),
                rs.getTimestamp("paid_at") == null ? null : rs.getTimestamp("paid_at").toInstant(),
                rs.getString("paid_reference")));
    }

    /** El administrador le pagó al aliado la comisión de ese negocio (Bre-B) y deja la referencia. */
    @Transactional
    public Row markPaid(UUID referredTenantId, String reference, UUID adminId) {
        String ref = reference == null ? "" : reference.trim();
        if (ref.isEmpty()) {
            throw new BusinessRuleException("Escribe la referencia del pago al aliado.");
        }
        int n = jdbc.update("""
                UPDATE platform.referrals SET paid_at = ?, paid_reference = ?, paid_by = ?
                WHERE referred_tenant_id = ? AND status = 'QUALIFIED' AND partner_id IS NOT NULL AND paid_at IS NULL""",
                Timestamp.from(Instant.now()), ref, adminId, referredTenantId);
        if (n == 0) {
            throw new BusinessRuleException("Esa comisión no está pendiente de pago.");
        }
        return referrals().stream().filter(r -> r.referredTenantId().equals(referredTenantId)).findFirst().orElseThrow();
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
