package com.poshibrido.tenancy.infrastructure;

import com.poshibrido.tenancy.domain.TenantSchemas;
import lombok.RequiredArgsConstructor;
import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Entrega a Hibernate conexiones con {@code search_path} apuntando al schema del tenant y lo
 * restablece al liberarlas, para no contaminar el pool.
 */
@Component
@RequiredArgsConstructor
public class TenantConnectionProvider implements MultiTenantConnectionProvider<String> {

    private final DataSource dataSource;

    /**
     * Conexión usada por Hibernate para metadatos y validación del schema al arrancar:
     * apunta a la plantilla de tenant para que {@code ddl-auto=validate} vea las tablas de negocio.
     */
    @Override
    public Connection getAnyConnection() throws SQLException {
        return withSearchPath(dataSource.getConnection(),
                TenantSchemas.TEMPLATE_SCHEMA + ", " + TenantSchemas.PLATFORM_SCHEMA);
    }

    @Override
    public void releaseAnyConnection(Connection connection) throws SQLException {
        resetAndClose(connection);
    }

    @Override
    public Connection getConnection(String tenantIdentifier) throws SQLException {
        String searchPath = TenantSchemas.PLATFORM_SCHEMA.equals(tenantIdentifier)
                ? TenantSchemas.PLATFORM_SCHEMA
                : TenantSchemas.requireTenantSchema(tenantIdentifier) + ", public";
        return withSearchPath(dataSource.getConnection(), searchPath);
    }

    @Override
    public void releaseConnection(String tenantIdentifier, Connection connection) throws SQLException {
        resetAndClose(connection);
    }

    @Override
    public boolean supportsAggressiveRelease() {
        return false;
    }

    @Override
    public boolean isUnwrappableAs(Class<?> unwrapType) {
        return false;
    }

    @Override
    public <T> T unwrap(Class<T> unwrapType) {
        throw new UnsupportedOperationException("No se puede desenvolver como " + unwrapType.getName());
    }

    /** El searchPath solo contiene nombres validados por {@link TenantSchemas}. */
    private static Connection withSearchPath(Connection connection, String searchPath) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("SET search_path TO " + searchPath);
            return connection;
        } catch (SQLException ex) {
            connection.close();
            throw ex;
        }
    }

    private static void resetAndClose(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("RESET search_path");
        } finally {
            connection.close();
        }
    }
}
