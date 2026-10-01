# Arquitectura

## Visión general
Monolito modular en Spring Boot con un único `EntityManagerFactory` y un único `TransactionManager`.
Cada negocio (tenant) vive en su propio schema de PostgreSQL `t_<slug>`; los datos globales viven en `platform`.

```
com.poshibrido
  shared/        errores de dominio, ProblemDetail, paginación, auditoría base, UUID v7
  config/        seguridad (JWT, CORS, rate limit)
  identity/      usuarios, login, tokens, refresh, membresías        -> platform.*
  tenancy/       tenants, resolución de tenant, schemas, Flyway, aprovisionamiento
  access/        roles, permisos, miembros e invitaciones (reglas anti-escalada)
  organization/  sucursales, cajas registradoras, ajustes del negocio  -> t_<slug>.*
  catalog/       categorías, unidades, impuestos, productos, códigos, listas de precios, importación
  parties/       terceros: clientes y proveedores (NIT con DV)
  location/      catálogo DIVIPOLA (departamentos y municipios)       -> platform.*
  audit/         registro de auditoría (audit_log del negocio)
```
Los módulos se hablan por interfaces públicas (`TenantApi`, `UserApi`, `MembershipApi`, `SessionApi`,
`InvitationApi`, `AccessApi`, `BranchApi`, `BusinessSettingsApi`, `LocationApi`, `PricingApi`, `PriceListApi`,
`TenantDataSeeder`),
nunca por repositorios ajenos.

## Invitaciones
```
Admin (token de negocio)            Invitado
POST /members/invitations  ──────▶  enlace <origen>/invitacion/<token>  (WhatsApp, correo…)
  · roles ⊆ permisos del admin       POST /invitations/preview  (público)
  · guarda hash del token            registro / login (returnUrl) ──▶ POST /invitations/accept
                                       · correo de la sesión = correo invitado
                                       · crea/reactiva member + roles + sucursales (JDBC calificado)
                                       · membership ACTIVE, invitación ACCEPTED, audit_log
                                     POST /auth/select-tenant
```

## Flujo de una petición de negocio
1. `RequestIdFilter` asigna `requestId` (MDC y header `X-Request-Id`).
2. `BearerTokenAuthenticationFilter` valida el JWT (firma HS256, `exp`, `iss`).
3. Autorización por URL: `/api/v1/**` de negocio exige `TENANT_SESSION` (token con `tid`), si no → 403.
4. `TenantContextFilter` resuelve `tid` → negocio `ACTIVE` y fija `TenantContext` (ThreadLocal), limpiándolo en `finally`.
5. `@PreAuthorize("hasAuthority('recurso:acción')")` en el controlador.
6. Al abrir la sesión de Hibernate, `TenantIdentifierResolver` devuelve el schema y `TenantConnectionProvider`
   ejecuta `SET search_path TO t_<slug>, public`; al liberar la conexión, `RESET search_path`.

## Sesión
```
POST /auth/login            -> token de plataforma (sin tid) + cookie refresh + lista de negocios
POST /auth/select-tenant    -> token de negocio (tid, perms) + cookie refresh nueva (la anterior se revoca)
POST /auth/refresh          -> rota la cookie y emite un access token del mismo tipo
POST /auth/logout           -> revoca la cookie
```
El access token (15 min) vive solo en memoria en el frontend; el refresh (7 días) solo en cookie HttpOnly.

## Aprovisionamiento
`PROVISIONING` (tx plataforma) → `CREATE SCHEMA` + Flyway `db/tenant` (tablas + datos base) → miembro dueño con rol
OWNER → membresía + `ACTIVE` (tx plataforma). Cualquier fallo: `DROP SCHEMA … CASCADE` y `FAILED` (reintentable).

## Migraciones
- `db/platform`: schema `platform`.
- `db/tenant`: cada `t_<slug>` y la plantilla `tenant_template` (usada para validar el modelo JPA).
Al arrancar se migran `platform`, la plantilla y todos los negocios `ACTIVE`, antes de iniciar Hibernate.

## Catálogo: precio de un código escaneado
```
código ──▶ product_barcodes ──▶ (producto, unidad: base o presentación)
   └─(si no es código)──▶ SKU ──▶ (producto, unidad base)
precio = lista del cliente (price_list_items[lista, producto, unidad])
         └─ si no hay ──▶ General: unidad base → products.sale_price
                                    presentación → conversion.sale_price ?? sale_price × factor
```
`PricingApi.price(productId, unitId, priceListId)` es el punto de entrada para ventas (Fase 5).
