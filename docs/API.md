# API (v1)

Base: `/api/v1`. Errores en `application/problem+json` (RFC 9457). Swagger UI en `/swagger-ui.html` con `OPENAPI_ENABLED=true`.

## Autenticación (plataforma)
| Método | Ruta | Token | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Crea la cuenta. `{email, password, fullName, phone?}` → 201 |
| POST | `/auth/login` | — | `{email, password}` → token de plataforma + cookie `pos_refresh` + `tenants[]`. 401 credenciales, 423 bloqueado |
| POST | `/auth/select-tenant` | cualquiera | `{tenantId}` → token de negocio + cookie. 403 sin membresía/negocio inactivo |
| POST | `/auth/refresh` | cookie | Rota la cookie y devuelve nuevo access token. 401 si expiró o fue reutilizada |
| POST | `/auth/logout` | cookie | Revoca la cookie. 204 |
| GET | `/auth/me` | cualquiera | Usuario, `tenantId` y permisos del token |

Respuesta de sesión:
```json
{ "accessToken": "...", "tokenType": "Bearer", "expiresIn": 900,
  "user": {"id": "...", "email": "...", "fullName": "...", "platformAdmin": false},
  "tenantId": null, "permissions": [], "tenants": [ ... ] }
```

## Negocios (plataforma)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/tenants` | Negocios donde soy miembro activo o dueño |
| POST | `/tenants` | `{slug, legalName, tradeName, businessType:"RETAIL"}` → 201. 409 slug repetido, 422 tipo no disponible, 503 falló el aprovisionamiento |
| POST | `/tenants/{id}/retry-provisioning` | Solo el dueño y solo si está `FAILED` (409 si no; 404 si no es suyo) |

## Negocio (requiere token con `tid`; sin él → 403)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/branches?page=0&size=20&sort=code,asc` | `branches:read` | Sucursales paginadas |
| POST | `/branches` | `branches:manage` | `{code, name, address?, cityCode?, phone?}` → 201 |

Paginación: `{ content, page, size, totalElements, totalPages }`.

## Permisos sembrados
`settings:read|manage`, `branches:read|manage`, `cash-registers:manage`, `members:read|manage`, `roles:manage`,
`products:read|manage`, `parties:read|manage`, `inventory:read|adjust|transfer`, `cash:operate|read`,
`sales:create|read|void|discount`, `reports:read`.
Roles: OWNER y ADMIN (todos), CASHIER, SELLER, WAREHOUSE, ACCOUNTANT (ver `db/tenant/V2__seed_access_and_organization.sql`).
