# Registro de decisiones (ADR)

Cada decisión o suposición que se aparta del prompt maestro, o lo precisa, queda aquí.

## Fase 0 — Esqueleto

1. **Versiones.** Java 21 LTS + Spring Boot 4.1.1 (Spring Framework 7, Spring Security 7, Hibernate 7, Jackson 3) + Angular 19 + PrimeNG 19 + Tailwind 4. El prompt pedía Boot 3.5.x; el equipo eligió Boot 4.1.1 manteniendo Java 21 (Boot 4 lo soporta). La versión de Java es la misma en `pom.xml`, `Dockerfile` y CI.
2. **Monorepo.** `backend/`, `frontend/`, `docs/`, `docker-compose.yml`, `.github/workflows/ci.yml`.
3. **Errores.** `GlobalExceptionHandler` único con `ProblemDetail` (RFC 9457). Nunca se expone `ex.getMessage()` de excepciones técnicas.

## Fase 1 — Identidad, tenancy y aprovisionamiento

### Correcciones a la Fase 0 encontradas al iniciar
4. `application.properties` contenía YAML (Spring lo leía como properties y se perdía la configuración). Se reemplazó por `application.yml`.
5. Había dos migraciones `V1` en `db/platform` (una era del tenant): Flyway no arranca así. La del tenant pasó a `db/tenant`. Como ninguna base llegó a migrarse (el arranque fallaba), se reescribieron `V1`/`V2` de plataforma en lugar de agregar `V3`.
6. En Boot 4 cambiaron paquetes y artefactos: `HibernatePropertiesCustomizer` está en `org.springframework.boot.hibernate.autoconfigure`; Testcontainers 2 usa `testcontainers-postgresql` y `org.testcontainers.postgresql.PostgreSQLContainer`; springdoc 3.x es la línea compatible con Boot 4.
7. `package.json` del frontend declaraba `primeng` y `@tailwindcss/postcss` pero el `package-lock.json` no los tenía (`npm ci` fallaba). Hay que regenerar el lock con `npm install` (ver README).

### Seguridad y tokens
8. **JWT HS256 con Spring Security OAuth2 JOSE (Nimbus)** en lugar de JJWT: se integra nativamente con `oauth2ResourceServer().jwt()`, valida firma, `exp` e `iss`, y evita la dependencia de JJWT con Jackson 2. La configuración es manual (sin autoconfiguración de resource server).
9. **Claims.** `sub` (usuario), `typ` (`platform`|`tenant`), `tid` (negocio, solo en tokens de negocio), `perms` (permisos del negocio), `padm` (solo superadmin). El tenant se toma **únicamente** de `tid`; no existe header de tenant.
10. **Token de plataforma vs. de negocio.** Los endpoints de negocio (`/api/v1/**` excepto `auth` y `tenants`) exigen la autoridad `TENANT_SESSION`, que solo tiene un token con `tid` → un token de plataforma recibe **403**. Además cada endpoint declara `@PreAuthorize("hasAuthority('recurso:acción')")`.
11. **Sin tenant en contexto**, Hibernate usa una conexión con `search_path = platform`, donde no existen tablas de negocio: una consulta de negocio sin tenant falla en lugar de caer en otro negocio. No hay "tenant por defecto".
12. **Refresh token.** Opaco (32 bytes aleatorios), guardado como SHA-256, rotado en cada uso, con detección de reutilización (si llega un token ya rotado se revocan todas las sesiones del usuario). La sesión de plataforma (antes de elegir negocio) también tiene refresh (`tenant_id` nulo). Al seleccionar negocio se revoca el refresh anterior.
13. **Ruta de la cookie `Path=/api/v1/auth`** (el prompt decía `/api/v1/auth/refresh`): logout y select-tenant también necesitan leer la cookie para revocarla. Sigue siendo `HttpOnly; Secure; SameSite=Strict`. `REFRESH_COOKIE_SECURE=false` solo si se sirve por HTTP en un host distinto de `localhost`.
14. **CSRF deshabilitado.** La API es stateless con Bearer; la única cookie es la de refresh, con `SameSite=Strict` y ruta limitada, y el refresh solo devuelve un access token al propio origen.
15. **Bloqueo por intentos fallidos:** 5 intentos → 15 minutos (`423 Locked`). Correo inexistente y contraseña errada devuelven el mismo mensaje y tiempo similar (hash señuelo) para no revelar qué correos existen.
16. **Rate limiting** en memoria por IP para login (10/min) y registro (5/min), configurable. Suficiente con una instancia; en Fase 7 se moverá a Redis o al proxy.
17. **Registro** crea el usuario en `ACTIVE`. La verificación por correo (`PENDING_VERIFICATION`) queda para Fase 7.
18. **Contraseñas** con `DelegatingPasswordEncoder` (BCrypt por defecto, permite migrar a Argon2 sin romper hashes). Política mínima: 10 caracteres con letras y números.
19. **Revocación de acceso**: un miembro desactivado o una membresía revocada dejan de poder elegir negocio o refrescar inmediatamente; un access token ya emitido sigue vigente hasta 15 min (TTL corto a propósito). El estado del negocio se cachea 30 s.

### Multi-tenancy
20. **Validación del modelo JPA (`ddl-auto=validate`).** Hibernate valida usando `getAnyConnection()`, que apunta a un schema plantilla `tenant_template` (migrado con `db/tenant` al arrancar). Así se validan las entidades de negocio sin elegir un negocio real. `tenant_template` no cumple el patrón `t_*`, por lo que nunca puede usarse como tenant.
21. **Orden de arranque.** Flyway se ejecuta de forma programática (`DatabaseMigrator`): `platform` → `tenant_template` → todos los negocios `ACTIVE`. Un `BeanFactoryPostProcessor` hace que el `entityManagerFactory` dependa de él, de modo que Hibernate valida sobre schemas ya migrados. Por eso no se usa `spring-boot-starter-flyway`.
22. **Nombres de schema en SQL.** Todo nombre pasa por `TenantSchemas` (slug `^[a-z][a-z0-9_]{2,40}$`, schema `^t_[a-z][a-z0-9_]{2,40}$`) antes de concatenarse. La tabla `platform.tenants` tiene además `CHECK` sobre el slug y `schema_name = 't_' || slug`.
23. **Consultas de acceso en JDBC con schema calificado** (`t_x.member_roles`…) al emitir tokens: en ese momento la petición aún no tiene tenant en contexto.
24. **Datos base en Flyway** (`db/tenant/V2__seed…`): permisos, 6 roles por defecto, sede `PRINCIPAL`, caja `CAJA-1` y ajustes del negocio. Son iguales en todos los negocios y quedan versionados. Solo el miembro dueño se siembra por código. Los IDs sembrados son UUID fijos (cada negocio tiene su propia copia).
25. **Semillas de módulos futuros** (métodos de pago, impuestos IVA 19/5/0, unidades, consumidor final, lista General, secuencias) se agregan como migraciones `db/tenant` en la fase de su módulo (3 y 5), para no crear tablas antes de que existan sus entidades.
26. **Aprovisionamiento fallido:** `DROP SCHEMA … CASCADE`, estado `FAILED` con `failure_reason` (solo el tipo de error; el detalle va al log) y respuesta `503`. Solo el dueño puede reintentar (`POST /api/v1/tenants/{id}/retry-provisioning`); a otros usuarios se les responde 404 para no revelar que existe.
27. **Tipos de negocio:** solo `RETAIL` se puede crear en el MVP (los demás responden 422).
28. **Aplazado a fases siguientes:** `plans`/`subscriptions` (Fase 7), catálogo DIVIPOLA `departments`/`cities` (Fase 2; mientras tanto las sucursales guardan `city_code` de 5 dígitos), invitación de miembros (Fase 2).

### Pendiente de confirmar en el primer build real
El entorno donde se escribió esta fase no tenía acceso a Maven Central, npm ni Docker Hub, así que el código **no se compiló allí**; el SQL sí se validó contra PostgreSQL 16. Si el primer CI falla, revisar primero:
- Si los campos extra del `ProblemDetail` (`errors`, `timestamp`) salen anidados en `properties` con Jackson 3: registrar el mixin de `ProblemDetail` en el `JsonMapper`.
- Si `ddl-auto=validate` reclama por `Instant` ↔ `timestamptz`: anotar con `@JdbcTypeCode(SqlTypes.TIMESTAMP_UTC)`.
- Si springdoc 3.0.0 no arranca con Boot 4.1: subir a la última 3.0.x.
