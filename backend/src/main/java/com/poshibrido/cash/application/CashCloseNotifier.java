package com.poshibrido.cash.application;

import com.poshibrido.cash.application.CashViews.SessionReport;
import com.poshibrido.cash.application.CashViews.SessionView;
import com.poshibrido.cash.infrastructure.CashSessionRepository;
import com.poshibrido.identity.application.UserApi;
import com.poshibrido.identity.application.UserSummary;
import com.poshibrido.mail.MailTemplates;
import com.poshibrido.mail.MailTemplates.CashCloseSummary;
import com.poshibrido.mail.MailTemplates.MethodLine;
import com.poshibrido.mail.Mailer;
import com.poshibrido.organization.application.BusinessSettingsApi;
import com.poshibrido.tenancy.application.CurrentTenant;
import com.poshibrido.tenancy.application.TenantApi;
import com.poshibrido.tenancy.application.TenantInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Resumen de cada cierre de caja al correo del dueño del negocio (decisión 253): ventas, medios de pago y el arqueo
 * con su diferencia, aunque el que cierre sea un cajero (cierre ciego: él no ve el esperado; el dueño sí). Se
 * desactiva en Ajustes ({@code cash_close_email}). Nunca impide el cierre: se arma después del commit, en una
 * transacción propia de solo lectura (si algo falla ahí, el cierre ya quedó guardado y el error solo va al log).
 */
@Component
public class CashCloseNotifier {

    private static final Logger log = LoggerFactory.getLogger(CashCloseNotifier.class);

    private final BusinessSettingsApi settings;
    private final TenantApi tenants;
    private final UserApi users;
    private final CashQueryService queries;
    private final MailTemplates templates;
    private final Mailer mailer;
    private final CashSessionRepository sessions;
    private final TransactionTemplate tx;

    public CashCloseNotifier(BusinessSettingsApi settings, TenantApi tenants, UserApi users, CashQueryService queries,
                             MailTemplates templates, Mailer mailer, CashSessionRepository sessions,
                             PlatformTransactionManager transactionManager) {
        this.settings = settings;
        this.tenants = tenants;
        this.users = users;
        this.queries = queries;
        this.templates = templates;
        this.mailer = mailer;
        this.sessions = sessions;
        // Desde afterCommit, todo acceso a datos debe ir en una transacción nueva (si no, se "une" a la ya terminada).
        this.tx = new TransactionTemplate(transactionManager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.tx.setReadOnly(true);
    }

    /** Llamado al cerrar la caja: el correo se arma cuando el cierre ya quedó guardado. */
    public void sessionClosed(UUID sessionId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send(sessionId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send(sessionId);
            }
        });
    }

    private void send(UUID sessionId) {
        try {
            tx.executeWithoutResult(status -> notifyOwner(sessionId));
        } catch (RuntimeException ex) {
            log.warn("No se pudo preparar el resumen del cierre de caja {}: {}", sessionId, ex.toString());
        }
    }

    private void notifyOwner(UUID sessionId) {
        if (!settings.current().cashCloseEmail()) {
            return;
        }
        TenantInfo tenant = tenants.findInfo(CurrentTenant.require().id()).orElse(null);
        if (tenant == null || tenant.ownerUserId() == null) {
            return;
        }
        UserSummary owner = users.findSummaries(Set.of(tenant.ownerUserId())).get(tenant.ownerUserId());
        if (owner == null || owner.email() == null) {
            return;
        }
        var session = sessions.findById(sessionId).orElse(null);
        if (session == null || session.isOpen()) {
            return;
        }
        SessionReport report = queries.buildReport(session, true);
        // Dentro de esta transacción: el Mailer lo entrega al terminarla.
        mailer.send(templates.cashClosed(owner.email(), owner.fullName(), summary(tenant.tradeName(), report)));
    }

    static CashCloseSummary summary(String businessName, SessionReport report) {
        SessionView s = report.session();
        String register = s.registerName() != null ? s.registerName() : s.registerCode() != null ? s.registerCode() : "Caja";
        List<MethodLine> methods = report.byMethod().stream()
                .map(m -> new MethodLine(m.name(), m.count(), m.amount()))
                .toList();
        return new CashCloseSummary(businessName, register, s.branchName(), nameOr(s.openedByName()),
                nameOr(s.closedByName()), s.openedAt(), s.closedAt(), report.salesCount(), report.salesTotal(),
                report.voidedCount(), report.voidedTotal(), methods, report.cash().opening(), report.cash().expected(),
                report.cash().counted(), report.cash().difference(), s.closingNotes());
    }

    private static String nameOr(String name) {
        return name == null || name.isBlank() ? "Un usuario" : name;
    }
}
