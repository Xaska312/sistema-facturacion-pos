package com.poshibrido.subscription.application;

import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.Mailer;
import com.poshibrido.subscription.domain.ReminderStage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Avisos por correo al dueño (7, 3 y 1 día antes del fin, al terminar y al acabarse la gracia). Corre todos los días
 * a las 9 a. m. de Colombia. Cada aviso sale una vez por fecha de fin: se marca en la misma fila con una actualización
 * condicionada, así una segunda ejecución (o un segundo servidor) no lo repite.
 */
@Slf4j
@Component
public class SubscriptionReminders {

    private static final ZoneId BOGOTA = ZoneId.of("America/Bogota");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final SubscriptionProperties properties;
    private final Mailer mailer;
    private final MailTemplates templates;

    public SubscriptionReminders(DataSource dataSource, PlatformTransactionManager transactionManager,
                                 SubscriptionProperties properties, Mailer mailer, MailTemplates templates) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.tx = new TransactionTemplate(transactionManager);
        this.properties = properties;
        this.mailer = mailer;
        this.templates = templates;
    }

    private record Candidate(UUID tenantId, String tradeName, String ownerEmail, String ownerName, String planName,
                             boolean trial, Instant endsAt, String lastStage, Instant lastEndsAt) {
    }

    @Scheduled(cron = "0 0 9 * * *", zone = "America/Bogota")
    public void daily() {
        if (properties.remindersEnabled()) {
            int sent = sendDue();
            log.info("Avisos de suscripción enviados: {}", sent);
        }
    }

    /** Envía los avisos pendientes y devuelve cuántos salieron. */
    public int sendDue() {
        Instant now = Instant.now();
        List<Candidate> candidates = jdbc.query("""
                SELECT s.tenant_id, t.trade_name, u.email, u.full_name, p.name AS plan_name, s.trial, s.ends_at,
                       s.last_reminder_stage, s.last_reminder_ends_at
                FROM platform.subscriptions s
                JOIN platform.tenants t ON t.id = s.tenant_id
                JOIN platform.users u ON u.id = t.owner_user_id
                JOIN platform.plans p ON p.code = s.plan_code
                WHERE t.status = 'ACTIVE'
                  AND s.ends_at < now() + INTERVAL '7 days 1 hour'
                  AND s.ends_at > now() - make_interval(days => ?) - INTERVAL '30 days'""",
                (rs, i) -> new Candidate(rs.getObject("tenant_id", UUID.class), rs.getString("trade_name"),
                        rs.getString("email"), rs.getString("full_name"), rs.getString("plan_name"),
                        rs.getBoolean("trial"), rs.getTimestamp("ends_at").toInstant(),
                        rs.getString("last_reminder_stage"),
                        Optional.ofNullable(rs.getTimestamp("last_reminder_ends_at")).map(Timestamp::toInstant)
                                .orElse(null)),
                properties.graceDays());
        int sent = 0;
        for (Candidate c : candidates) {
            Optional<ReminderStage> due = ReminderStage.due(c.trial(), c.endsAt(), properties.grace(), now, BOGOTA);
            if (due.isEmpty() || alreadySent(c, due.get())) {
                continue;
            }
            try {
                Boolean ok = tx.execute(status -> send(c, due.get()));
                if (Boolean.TRUE.equals(ok)) {
                    sent++;
                }
            } catch (RuntimeException ex) {
                log.error("No se pudo enviar el aviso de suscripción del negocio {}", c.tenantId(), ex);
            }
        }
        return sent;
    }

    private static boolean alreadySent(Candidate c, ReminderStage stage) {
        return c.lastStage() != null && c.endsAt().equals(c.lastEndsAt())
                && ReminderStage.valueOf(c.lastStage()).ordinal() >= stage.ordinal();
    }

    private boolean send(Candidate c, ReminderStage stage) {
        int marked = jdbc.update("""
                UPDATE platform.subscriptions SET last_reminder_stage = ?, last_reminder_ends_at = ends_at
                WHERE tenant_id = ? AND ends_at = ?
                  AND (last_reminder_ends_at IS DISTINCT FROM ends_at OR last_reminder_stage IS DISTINCT FROM ?)""",
                stage.name(), c.tenantId(), Timestamp.from(c.endsAt()), stage.name());
        if (marked == 0) {
            return false;
        }
        String instructions = properties.paymentInstructions();
        mailer.send(switch (stage) {
            case D7, D3, D1 -> templates.subscriptionEnding(c.ownerEmail(), c.ownerName(), c.tradeName(),
                    c.planName(), c.trial(), c.endsAt(), ReminderStage.calendarDaysLeft(c.endsAt(), Instant.now(), BOGOTA),
                    instructions);
            case ENDED -> templates.subscriptionEnded(c.ownerEmail(), c.ownerName(), c.tradeName(), c.trial(),
                    c.endsAt().plus(properties.grace()), instructions);
            case BLOCKED -> templates.subscriptionBlocked(c.ownerEmail(), c.ownerName(), c.tradeName(), instructions);
        });
        return true;
    }
}
