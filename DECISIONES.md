# Registro de Decisiones de Arquitectura (ADR)

## Fase 0 - Inicialización del Esqueleto

1. **Versión de Spring Boot**: Aunque la arquitectura apunta a Spring Boot 3.5.x, dado que actualmente la versión estable en Maven Central es la 3.4.x (y el código debe compilar hoy), utilizaremos la versión `3.4.2`. Actualizaremos a 3.5.x mediante un PR simple en cuanto esté disponible. La versión de Java se mantiene en `21 LTS`.
2. **Estructura del Monorepo**: Se separan `backend` y `frontend` en directorios raíz. Docker Compose orquestará las dependencias locales y montará los contenedores de desarrollo.
3. **Manejo de Errores**: Se implementa `GlobalExceptionHandler` usando `ProblemDetail` (RFC 9457) centralizando las respuestas HTTP genéricas (400, 404, 500) para evitar fugas de trazas técnicas al cliente.
4. **Flyway y Esquemas**: Se configura Spring Boot para no usar el esquema `public`. Las migraciones de plataforma iniciales crearán explícitamente el esquema `platform`.
5. **Actualización de Versión**: Debido a la disponibilidad en Spring Initializr, se actualiza la versión del framework base a Spring Boot 4.1.1, manteniendo compatibilidad con Java 21. El archivo pom.xml y la configuración de CI/CD reflejarán este cambio.
6. **Multi-tenancy a nivel de base de datos**: Se utiliza el enfoque de esquemas separados en PostgreSQL (`t_<slug>`). La resolución en Hibernate se logra implementando `CurrentTenantIdentifierResolver` y `MultiTenantConnectionProvider`, inyectando el tenant en un `ThreadLocal` (TenantContext) únicamente a partir del claim `tid` del JWT. Las migraciones de inquilinos se ejecutan programáticamente con Flyway durante el aprovisionamiento.