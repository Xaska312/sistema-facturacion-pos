package com.poshibrido.support;

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

    private static final PostgreSQLContainer POSTGRES;

    static {
        if (System.getenv("POS_TEST_DB_URL") == null) {
            POSTGRES = new PostgreSQLContainer("postgres:16-alpine")
                    .withDatabaseName("pos_test")
                    .withUsername("test")
                    .withPassword("test");
            POSTGRES.start();
        } else {
            POSTGRES = null;
        }
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
    }

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private DataSource dataSource;

    protected MockMvc mvc;
    protected TestApi api;
    protected JdbcTemplate jdbc;

    @BeforeEach
    void setUpMockMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        api = new TestApi(mvc);
        jdbc = new JdbcTemplate(dataSource);
    }
}
