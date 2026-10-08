package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.domain.TenantSchemas;
import com.zaxxer.hikari.HikariDataSource;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Al arrancar: migra {@code platform}, luego la plantilla de tenant y luego todos los negocios activos y
 * suspendidos (un suspendido se puede reactivar en cualquier momento y su auditoría sigue recibiendo registros).
 * Los FAILED se migran al reintentar el aprovisionamiento. El EntityManagerFactory depende de este bean
 * ({@link MigrationOrderConfig}), por lo que Hibernate valida el modelo sobre un schema ya migrado.
 *
 * <p>Si falla {@code platform} o la plantilla, el arranque falla (no hay nada que servir). Si falla un negocio, se
 * registra el error, ese negocio queda sin servicio ({@link TenantMigrationFailures}) y los demás arrancan (QA INV-1).
 * Los negocios se migran de a {@value #PARALLELISM} a la vez (menos si el pool es pequeño): con cientos de negocios, uno por uno alargaba cada
 * arranque (QA INV-12); al estar al día, Flyway tarda ~50–150 ms por negocio.
 */
@Slf4j
@RequiredArgsConstructor
@Component(DatabaseMigrator.BEAN_NAME)
public class DatabaseMigrator implements InitializingBean {

    public static final String BEAN_NAME = "databaseMigrator";
    static final int PARALLELISM = 4;

    private final DataSource dataSource;
    private final TenantSchemaMigrator migrator;
    private final TenantMigrationFailures failures;

    @Override
    public void afterPropertiesSet() {
        long start = System.nanoTime();
        migrator.migratePlatform();
        migrator.migrateTenant(TenantSchemas.TEMPLATE_SCHEMA);

        List<String> schemas = new JdbcTemplate(dataSource).queryForList(
                "SELECT schema_name FROM platform.tenants WHERE status IN ('ACTIVE', 'SUSPENDED') ORDER BY created_at",
                String.class);
        ExecutorService pool = Executors.newFixedThreadPool(parallelism(), runnable -> {
            Thread thread = new Thread(runnable, "tenant-migration");
            thread.setDaemon(true);
            return thread;
        });
        try {
            List<Future<?>> pending = new ArrayList<>();
            for (String schema : schemas) {
                pending.add(pool.submit(() -> migrateOne(schema)));
            }
            for (Future<?> future : pending) {
                future.get();
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Migración de negocios interrumpida", ex);
        } catch (ExecutionException ex) {
            throw new IllegalStateException("Migración de negocios", ex.getCause());
        } finally {
            pool.shutdownNow();
        }
        long millis = (System.nanoTime() - start) / 1_000_000;
        if (failures.failed().isEmpty()) {
            log.info("Migración de {} negocios (activos y suspendidos) completada en {} ms", schemas.size(), millis);
        } else {
            log.error("Migración de {} negocios en {} ms: {} NO se migraron y quedan sin servicio hasta corregirlos y"
                    + " reiniciar: {}", schemas.size(), millis, failures.failed().size(), failures.failed());
        }
    }

    private void migrateOne(String schema) {
        String safe;
        try {
            safe = TenantSchemas.requireTenantSchema(schema);
        } catch (RuntimeException ex) {
            failures.markFailed(schema);
            log.error("Nombre de schema inválido en platform.tenants: {}", schema, ex);
            return;
        }
        try {
            migrator.migrateTenant(safe);
            failures.markOk(safe);
        } catch (RuntimeException ex) {
            failures.markFailed(safe);
            log.error("No se pudo migrar el negocio {}: queda sin servicio", safe, ex);
        }
    }

    /**
     * Cada migración toma una o dos conexiones del pool: con un pool pequeño, migrar de a 4 podía dejar a un negocio
     * sin conexión libre (10 s de espera) y marcarlo como fallido sin estar dañado.
     */
    private int parallelism() {
        try {
            if (dataSource.isWrapperFor(HikariDataSource.class)) {
                int poolSize = dataSource.unwrap(HikariDataSource.class).getMaximumPoolSize();
                return Math.max(1, Math.min(PARALLELISM, poolSize / 2));
            }
        } catch (SQLException ex) {
            log.debug("No se pudo leer el tamaño del pool", ex);
        }
        return 1;
    }
}
