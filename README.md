# POS SaaS Híbrido — Monorepo

POS web multi-negocio para comercios en Colombia. Backend Spring Boot 4.1 (Java 21) + PostgreSQL 16, frontend Angular 19 + PrimeNG 19.

- Arquitectura: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- API: [`docs/API.md`](docs/API.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md)

## Estado de las fases
| Fase | Estado |
|---|---|
| 0 — Esqueleto | ✅ Completada |
| 1 — Identidad, tenancy y aprovisionamiento | ✅ Completada (validada en local el 2026-10-01: 21 tests en verde y app probada) |
| 2 — Acceso y organización | ⏳ Siguiente |

## Requisitos
- **Docker Desktop** (o Docker Engine + Compose). Debe estar en estado *Engine running* antes de levantar el proyecto o correr los tests.
- Para desarrollar fuera de Docker: **JDK 21** (con `JAVA_HOME` configurado) y **Node 22**.
- **No hace falta instalar Maven**: el proyecto trae el Maven Wrapper (`mvnw` / `mvnw.cmd`).

## Primera vez (una sola vez por equipo)
Desde la carpeta raíz del repositorio.

**Windows (PowerShell)**
```powershell
Copy-Item .env.example .env
notepad .env          # define DB_PASSWORD y JWT_SECRET (mínimo 32 caracteres)
cd frontend; npm install; cd ..
```
**Linux / macOS**
```bash
cp .env.example .env  # define DB_PASSWORD y JWT_SECRET (openssl rand -base64 48)
(cd frontend && npm install)
```
`.env` contiene tus claves: **nunca** se sube al repositorio (está en `.gitignore`).

## Levantar la aplicación
```bash
docker compose up --build
```
La primera vez tarda varios minutos. Deja la terminal abierta; `Ctrl+C` la detiene.

| Qué | URL |
|---|---|
| Aplicación | http://localhost:4200 |
| Salud del backend | http://localhost:8080/actuator/health → `{"status":"UP"}` |
| Swagger (con `OPENAPI_ENABLED=true`) | http://localhost:8080/swagger-ui.html |

Flujo para probar: **Regístrate → inicia sesión → crea un negocio → Entrar**. Verás el menú según tus permisos y la sede principal en *Sucursales*.

Comandos útiles:
```bash
docker compose down          # detiene y borra los contenedores (conserva la base de datos)
docker compose down -v       # además BORRA la base de datos (útil para empezar de cero)
docker compose up --build    # reconstruye después de cambiar código
```

## Tests
**Windows (PowerShell)**
```powershell
cd backend; .\mvnw.cmd verify     # unitarios + integración (*IT) con Testcontainers (requiere Docker)
cd frontend; npm run test:ci       # Karma + ChromeHeadless
```
**Linux / macOS**
```bash
cd backend && ./mvnw verify
cd frontend && npm run test:ci
```
`mvnw verify` solo ejecuta las pruebas: levanta un PostgreSQL temporal, prueba y lo apaga; **no deja la aplicación corriendo** (para eso, `docker compose up`).

Sin Docker se pueden apuntar los tests a un PostgreSQL 16 existente con las variables
`POS_TEST_DB_URL`, `POS_TEST_DB_USER` y `POS_TEST_DB_PASSWORD`.

## Solución de problemas
| Síntoma | Causa | Solución |
|---|---|---|
| `mvn : The term 'mvn' is not recognized` | Maven no está instalado (no hace falta) | Usa `.\mvnw.cmd verify` desde `backend` |
| `JAVA_HOME is not set` al usar `mvnw` | Falta configurar el JDK 21 | Configura `JAVA_HOME` con la ruta del JDK 21 |
| Tests `*IT` fallan con *Could not find a valid Docker environment* | Docker Desktop no está corriendo | Ábrelo y espera *Engine running* |
| Postgres: `FATAL: role "xxx" does not exist` | La base ya existía con otro usuario; `POSTGRES_USER` solo se aplica al crearla | `docker compose down -v` y `docker compose up --build` |
| Backend: *Failed to configure a DataSource… embedded database* | Docker usa una imagen vieja del backend | `docker compose up --build` (o `docker compose build --no-cache backend`) |
| `npm ci` falla en Docker o CI | `package-lock.json` desactualizado | `npm install` en `frontend` y commitear el lock |
| Advertencias amarillas de Java en VS Code (*Null type safety*) | Análisis de nulos de VS Code con las anotaciones de Spring 7 | Ya desactivado en `.vscode/settings.json`; luego `Ctrl+Shift+P` → *Java: Clean Java Language Server Workspace* |
| `warning: LF will be replaced by CRLF` en Windows | Conversión de fin de línea de Git | Normal, no afecta nada |

---

## Fase 1 — Identidad, tenancy y aprovisionamiento ✅

Validada en local (Windows + Docker Desktop): `mvnw verify` con 21 tests en verde y la aplicación probada de punta a punta.

**Incluye:** registro, login con bloqueo por intentos, rate limiting, token de plataforma y de negocio (JWT),
refresh token rotativo en cookie HttpOnly con detección de reutilización, logout, creación de negocio
(schema `t_<slug>` + Flyway + datos base + dueño OWNER) con limpieza ante fallos y reintento,
selección de negocio, multi-tenancy por schema, sucursales (listar/crear) para demostrar el aislamiento.
Frontend: login, registro, selección de negocio, asistente de creación, shell con menú por permisos.

**Criterios de aceptación y tests que los cubren**
| Criterio | Test |
|---|---|
| Un token del negocio A no ve ni escribe datos de B; el header de tenant se ignora | `TenantIsolationIT.dataOfTenantANeverVisibleOrWritableFromTenantB` |
| Token sin `tid` → 403 en endpoints de negocio | `TenantIsolationIT.platformTokenWithoutTenantGetsForbiddenOnBusinessEndpoints` |
| Imposible elegir negocio sin membresía | `TenantIsolationIT.cannotSelectTenantWithoutMembership` |
| `tid` manipulado → 401 | `TenantIsolationIT.tamperedTenantClaimIsRejected` |
| Aprovisionamiento fallido deja el sistema limpio y se puede reintentar | `ProvisioningFailureIT` |
| Permisos aplicados por endpoint (cajero no crea sucursales) | `BranchPermissionIT` |
| Login, bloqueo, rotación y reutilización de refresh, logout | `AuthFlowIT` |

**Probar a mano (curl)**
```bash
API=http://localhost:8080/api/v1
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"ana@demo.co","password":"ClaveSegura123","fullName":"Ana Pérez"}'
TOKEN=$(curl -s -c cookies.txt -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"ana@demo.co","password":"ClaveSegura123"}' | jq -r .accessToken)
TID=$(curl -s -X POST $API/tenants -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"slug":"tienda_ana","legalName":"Tienda Ana S.A.S.","tradeName":"Tienda Ana","businessType":"RETAIL"}' | jq -r .id)
curl -s $API/branches -H "Authorization: Bearer $TOKEN"            # 403: el token no tiene negocio
TTOKEN=$(curl -s -b cookies.txt -c cookies.txt -X POST $API/auth/select-tenant \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"tenantId\":\"$TID\"}" | jq -r .accessToken)
curl -s $API/branches -H "Authorization: Bearer $TTOKEN"           # 200: sede principal
```
(Con `curl` por HTTP la cookie `Secure` no se reenvía salvo a `localhost`.)
