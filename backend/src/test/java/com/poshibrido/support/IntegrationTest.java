package com.poshibrido.support;

import com.poshibrido.identity.application.PlatformAdmins;
import com.poshibrido.support.TestApi.Session;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;

import javax.sql.DataSource;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

/**
 * Base de tests de integración contra PostgreSQL 16 real (Testcontainers).
 * Si se define {@code POS_TEST_DB_URL} (+ {@code POS_TEST_DB_USER}/{@code POS_TEST_DB_PASSWORD}) se usa
 * esa base en lugar de levantar un contenedor (útil en entornos sin Docker).
 */
@SpringBootTest
public abstract class IntegrationTest {

    /** Contenedor compartido por toda la ejecución; Testcontainers (Ryuk) lo detiene al terminar la JVM. */
    private static final PostgreSQLContainer POSTGRES = startContainerIfNeeded();

    @SuppressWarnings("resource") // se cierra al terminar la JVM, no al salir de este método
    private static PostgreSQLContainer startContainerIfNeeded() {
        if (System.getenv("POS_TEST_DB_URL") != null) {
            return null;
        }
        PostgreSQLContainer container = new PostgreSQLContainer("postgres:16-alpine")
                .withDatabaseName("pos_test")
                .withUsername("test")
                .withPassword("test");
        container.start();
        return container;
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        if (POSTGRES != null) {
            registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
            registry.add("spring.datasource.username", POSTGRES::getUsername);
            registry.add("spring.datasource.password", POSTGRES::getPassword);
        } else {
            registry.add("spring.datasource.url", () -> System.getenv("POS_TEST_DB_URL"));
            registry.add("spring.datasource.username", () -> System.getenv("POS_TEST_DB_USER"));
            registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("POS_TEST_DB_PASSWORD", ""));
        }
        registry.add("app.security.jwt-secret", () -> "clave-de-pruebas-con-mas-de-32-bytes-0123456789");
        registry.add("app.rate-limit.login-per-minute", () -> "10000");
        registry.add("app.rate-limit.register-per-minute", () -> "10000");
        registry.add("app.rate-limit.api-per-minute", () -> "100000");
        registry.add("app.rate-limit.heavy-per-minute", () -> "100000");
        registry.add("app.platform.admin-emails", () -> TestApi.PLATFORM_ADMIN_EMAIL);
    }

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private PlatformAdmins platformAdmins;

    protected MockMvc mvc;
    protected TestApi api;
    protected JdbcTemplate jdbc;

    @BeforeEach
    void setUpMockMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        api = new TestApi(mvc);
        jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * Sesión del administrador de plataforma: registra la cuenta configurada (si falta), aplica
     * {@code PLATFORM_ADMIN_EMAILS} como al arrancar el backend e inicia sesión.
     */
    protected Session platformAdmin() throws Exception {
        api.registerPlatformAdmin();
        platformAdmins.syncConfiguredAdmins();
        return api.login(TestApi.PLATFORM_ADMIN_EMAIL);
    }
}
