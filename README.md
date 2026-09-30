# POS SaaS Híbrido — Monorepo

POS web multi-negocio para comercios en Colombia. Backend Spring Boot 4.1 (Java 21) + PostgreSQL 16, frontend Angular 19 + PrimeNG 19.

- Arquitectura: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- API: [`docs/API.md`](docs/API.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md)

## Requisitos
Docker + Docker Compose. Para desarrollo fuera de Docker: Java 21, Maven 3.9+, Node 22.

## Levantar todo
```bash
cp .env.example .env
# edita .env: define DB_PASSWORD y JWT_SECRET (openssl rand -base64 48)
docker compose up --build
```
- Frontend: http://localhost:4200
- Backend: http://localhost:8080 — `GET /actuator/health` → `UP`
- Swagger (si `OPENAPI_ENABLED=true`): http://localhost:8080/swagger-ui.html

## Primera instalación del frontend (una sola vez)
El `package-lock.json` del frontend estaba desincronizado con `package.json`. Antes del primer push de esta fase:
```bash
cd frontend
npm install        # regenera package-lock.json con PrimeNG, @primeng/themes, Tailwind y Karma
git add package-lock.json
```
Sin esto, `npm ci` falla en CI y en Docker.

## Tests
```bash
cd backend && mvn verify          # unitarios + integración (*IT) con Testcontainers (requiere Docker)
cd frontend && npm run test:ci    # Karma + ChromeHeadless
```
Sin Docker se puede apuntar los tests a un PostgreSQL 16 existente:
`POS_TEST_DB_URL=jdbc:postgresql://localhost:5432/pos_test POS_TEST_DB_USER=... POS_TEST_DB_PASSWORD=... mvn verify`

---

## Fase 1 — Identidad, tenancy y aprovisionamiento

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
