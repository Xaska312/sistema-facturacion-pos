package com.poshibrido.ai.application;

import com.poshibrido.subscription.application.SubscriptionApi;
import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Cada 5 minutos revisa los negocios activos con XASKA IA y arma el Resumen del día de los que ya llegaron a su hora
 * (decisión 299). Cada negocio va con su propio contexto; un error en uno no detiene a los demás. Un segundo servidor
 * no lo repite: el resumen se reserva por fecha antes de pedírselo a la IA. Se apaga con
 * {@code app.ai.digest-schedule=false} (las pruebas llaman al servicio directamente).
 */
@Slf4j
@Component
public class DailyDigestScheduler {

    private final DailyDigestService digests;
    private final AnthropicMessages ai;
    private final SubscriptionApi subscriptions;
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public DailyDigestScheduler(DailyDigestService digests, AnthropicMessages ai, SubscriptionApi subscriptions,
                                DataSource dataSource, @Value("${app.ai.digest-schedule:true}") boolean enabled) {
        this.digests = digests;
        this.ai = ai;
        this.subscriptions = subscriptions;
        this.jdbc = new JdbcTemplate(dataSource);
        this.enabled = enabled;
    }

    @Scheduled(cron = "0 */5 * * * *")
    public void run() {
        if (!enabled || !ai.available()) {
            return;
        }
        List<TenantRef> active = jdbc.query("SELECT id, slug, schema_name FROM platform.tenants WHERE status = 'ACTIVE'",
                (rs, i) -> new TenantRef(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("schema_name")));
        for (TenantRef tenant : active) {
            try {
                if (subscriptions.aiMonthlyLimit(tenant.id(), DailyDigestService.ALLOWANCE) <= 0) {
                    continue;
                }
                TenantContext.set(tenant);
                LocalDate due = digests.dueDate();
                if (due != null) {
                    digests.generate(due, false);
                    log.info("Resumen del día {} armado para {}", due, tenant.slug());
                }
            } catch (RuntimeException ex) {
                log.warn("No se pudo armar el resumen del día de {}: {}", tenant.slug(), ex.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
    }
}
