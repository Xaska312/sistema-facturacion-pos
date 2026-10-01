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

## Invitaciones (lado del invitado)
El token viaja en el cuerpo, nunca en la URL de la API.
| Método | Ruta | Token | Descripción |
|---|---|---|---|
| POST | `/invitations/preview` | — (público) | `{token}` → `{tenantName, email, invitedByName, status, expired, expiresAt}`. 404 si no existe |
| POST | `/invitations/accept` | cualquiera | `{token}` → `{tenantId, tenantName}`. 403 si el correo de la sesión no coincide, 409 usada/revocada o ya miembro, 422 vencida |

## Catálogo DIVIPOLA (cualquier sesión)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/locations/departments` | 33 departamentos |
| GET | `/locations/departments/{code}/cities` | Municipios del departamento |
| GET | `/locations/cities/{code}` | Municipio (404 si no existe) |

## Negocio (requiere token con `tid`; sin él → 403)
### Sucursales y cajas
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/branches?page=0&size=20&sort=code,asc` | `branches:read` | Sucursales paginadas |
| GET | `/branches/{id}` | `branches:read` | Detalle |
| POST | `/branches` | `branches:manage` | `{code, name, address?, cityCode?, phone?}` → 201. `cityCode` debe existir en DIVIPOLA (422) |
| PUT | `/branches/{id}` | `branches:manage` | `{name, address?, cityCode?, phone?}` (el código no cambia) |
| POST | `/branches/{id}/deactivate` · `/activate` | `branches:manage` | 422 si es la última sucursal activa |
| GET | `/cash-registers?branchId=&page=&size=` | `branches:read` | Cajas (filtro opcional por sucursal) |
| GET | `/cash-registers/{id}` | `branches:read` | Detalle |
| POST | `/cash-registers` | `cash-registers:manage` | `{branchId, code, name}` → 201. 409 código repetido en la sucursal, 422 sucursal inexistente o inactiva |
| PUT | `/cash-registers/{id}` | `cash-registers:manage` | `{name}` |
| POST | `/cash-registers/{id}/deactivate` · `/activate` | `cash-registers:manage` | |

### Ajustes del negocio
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/settings` | `settings:read` | `{allowNegativeStock, pricesIncludeTax, timezone, currency, receiptFooter, maxDiscountPercent}` |
| PUT | `/settings` | `settings:manage` | Mismo cuerpo, todos los campos. 422 zona horaria inválida o moneda distinta de COP; 400 descuento fuera de 0–100 |

### Usuarios, roles e invitaciones
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/roles` | `roles:manage` o `members:read` | Roles con permisos y cantidad de usuarios |
| GET | `/permissions` | `roles:manage` o `members:read` | Catálogo de permisos (22) |
| POST | `/roles` | `roles:manage` | `{code, name, description?, permissions[]}` → 201. 409 código repetido, 422 permiso desconocido |
| PUT | `/roles/{id}` | `roles:manage` | `{name, description?, permissions[]}`. OWNER no se modifica (422) |
| DELETE | `/roles/{id}` | `roles:manage` | 204. 422 rol de sistema, 409 rol asignado |
| GET | `/members?search=&page=&size=` | `members:read` | Miembros con correo, roles, sucursales y marca `owner` |
| GET | `/members/{id}` | `members:read` | Detalle |
| PUT | `/members/{id}` | `members:manage` | `{roleIds[], branchIds[], defaultBranchId?}` |
| POST | `/members/{id}/deactivate` · `/activate` | `members:manage` | Desactivar revoca sus sesiones en el negocio |
| GET | `/members/invitations?pending=true` | `members:read` | Invitaciones (pendientes por defecto) |
| POST | `/members/invitations` | `members:manage` | `{email, roleIds[], branchIds[]}` → 201 `{invitation, token}`. El token se entrega **una sola vez**; el enlace es `<origen>/invitacion/<token>`. 409 si ya hay una pendiente o ya es miembro activo |
| POST | `/members/invitations/{id}/revoke` | `members:manage` | 409 si no está pendiente |

**Reglas anti-escalada** (403): nadie otorga, quita ni edita permisos que no tiene; el rol OWNER no se asigna;
el propietario no se modifica; nadie se modifica a sí mismo (422).

Paginación: `{ content, page, size, totalElements, totalPages }`.

## Permisos sembrados
`settings:read|manage`, `branches:read|manage`, `cash-registers:manage`, `members:read|manage`, `roles:manage`,
`products:read|manage`, `parties:read|manage`, `inventory:read|adjust|transfer`, `cash:operate|read`,
`sales:create|read|void|discount`, `reports:read`.
Roles: OWNER y ADMIN (todos), CASHIER, SELLER, WAREHOUSE, ACCOUNTANT (ver `db/tenant/V2__seed_access_and_organization.sql`).
