package com.poshibrido.ai.application;

import com.poshibrido.tenancy.application.TenantRef;
import com.poshibrido.tenancy.infrastructure.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

/**
 * "Lo que hiciste con Aska" (decisión 309): cada hora revisa los negocios activos y envía el correo del mes (el día 1
 * desde las 8 a. m. del negocio) y el del final de la prueba gratis (2 días antes). Cada uno sale una sola vez (se
 * aparta en {@code aska_recaps}). Se apaga con {@code app.ai.recap-schedule=false}.
 */
@Slf4j
@Component
public class AskaRecapScheduler {

    private final AskaRecapService recaps;
    private final JdbcTemplate jdbc;
    private final boolean enabled;

    public AskaRecapScheduler(AskaRecapService recaps, DataSource dataSource,
                              @Value("${app.ai.recap-schedule:true}") boolean enabled) {
        this.recaps = recaps;
        this.jdbc = new JdbcTemplate(dataSource);
        this.enabled = enabled;
    }

    @Scheduled(cron = "0 7 * * * *")
    public void run() {
        if (!enabled) {
            return;
        }
        List<TenantRef> active = jdbc.query("SELECT id, slug, schema_name FROM platform.tenants WHERE status = 'ACTIVE'",
                (rs, i) -> new TenantRef(rs.getObject("id", UUID.class), rs.getString("slug"), rs.getString("schema_name")));
        for (TenantRef tenant : active) {
            try {
                TenantContext.set(tenant);
                if (recaps.sendTrialIfDue()) {
                    log.info("Correo del final de la prueba de XASKA IA enviado a {}", tenant.slug());
                }
                if (recaps.sendMonthlyIfDue()) {
                    log.info("Correo del mes de Aska enviado a {}", tenant.slug());
                }
            } catch (RuntimeException ex) {
                log.warn("No se pudo enviar el correo de Aska de {}: {}", tenant.slug(), ex.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
    }
}
