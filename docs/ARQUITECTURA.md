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
  inventory/     saldos por sucursal, movimientos (kardex), documentos, costo promedio
  cash/          medios de pago, sesiones de caja, movimientos de efectivo, informe X/Z
  sales/         ventas (tiquete POS), cálculo, pagos, consecutivos, anulación, eventos
  reporting/     reportes y tablero (solo lectura, SQL nativo sobre las tablas del negocio), CSV
  location/      catálogo DIVIPOLA (departamentos y municipios)       -> platform.*
  audit/         registro de auditoría (audit_log del negocio)
```
Los módulos se hablan por interfaces públicas (`TenantApi`, `UserApi`, `MembershipApi`, `SessionApi`,
`InvitationApi`, `AccessApi`, `BranchApi`, `BusinessSettingsApi`, `LocationApi`, `PricingApi`, `PriceListApi`,
`InventoryCatalogApi`, `MemberDirectory`, `CashRegisterApi`, `CustomerApi`, `CashApi`, `SessionSalesSummary`,
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

## Inventario: libro de movimientos
```
caso de uso (ajuste, traslado, conteo; luego venta y compra)
   └─▶ StockLedger.open(sucursales, productos, productos con costo)      una transacción
         1. productos que cambian costo o aún sin costo manejado ── FOR NO KEY UPDATE (orden id)
         2. saldos faltantes: INSERT … ON CONFLICT DO NOTHING
         3. saldos ── FOR UPDATE (orden producto, sucursal)
       Session.post(...) por línea
         · entrada con costo → costo promedio ponderado → products.cost
         · saldo + cantidad (≥ 0 salvo permiso) → stock_balances
         · INSERT stock_movements (entry_no, balance_after)      ← inmutable (trigger)
```
Invariante, verificada por `GET /inventory/consistency` y por los tests: para cada saldo,
`quantity = Σ movimientos = balance_after del último movimiento`.

## Venta: una sola transacción
```
POST /sales (Idempotency-Key) ── ¿clave ya usada? ──▶ devuelve esa venta
  └─ transacción
      1. sesión de caja abierta del usuario ── FOR SHARE   (sin caja → 422; el cierre espera)
      2. cliente, precios (PricingApi), impuestos y descuentos recalculados ── ¿difieren? → 409
      3. pagos: Σ ≥ total, cambio solo en efectivo
      4. StockLedger: productos y saldos bloqueados en orden ── SALE por ítem (balance_after)
      5. document_sequences ── FOR UPDATE ── POS-n
      6. INSERT sales, sale_items, sale_tax_totals, sale_payments; cash_movements (efectivo neto)
      7. audit_log + evento SaleCompleted
```
La caja no depende de ventas: el informe de cierre pide el resumen de ventas por la interfaz `SessionSalesSummary`,
que implementa el módulo de ventas.

## Reportes
`reporting` es un modelo de lectura: consultas SQL nativas (agregaciones con CTE `filtered` = ventas registradas del
rango y `costs` = costo de lo vendido por venta) sobre la conexión del negocio actual. No escribe ni llama a otros
módulos. Las fechas se agrupan con `created_at AT TIME ZONE <zona del negocio>`. Los CSV se arman con
`shared/csv/CsvWriter` (Excel en español). En el frontend, todas las gráficas pasan por `shared/charts/chart.component` (Chart.js, UX-3).

## Frontend: sistema de diseño
Los colores viven solo en `frontend/src/styles.css` como tokens CSS (`--surface`, `--text`, `--brand`, `--success`,
`--warning`, `--danger`…) con su versión oscura bajo `.app-dark`. Tailwind los expone con `@theme`
(`bg-surface`, `text-muted`, `text-brand`, `bg-danger-soft`… y la utilidad `card`) y quita sus paletas propias;
PrimeNG usa la misma paleta con el preset `core/theme/app-preset.ts` (`definePreset(Aura, …)`,
`darkModeSelector: '.app-dark'`). `ThemeService` guarda claro/oscuro/sistema en `localStorage` y `index.html` aplica la
clase antes del primer render. `tools/check-colors.mjs` (en CI) rechaza colores literales en `src/app`.

El `ShellComponent` arma la estructura: menú lateral por permisos (`features/shell/menu.ts`, contraíble a iconos y
cajón en móvil), barra superior con migas de pan (`breadcrumbs.ts`, derivadas de la URL y del menú), tema y menú de
usuario. Cada ruta tiene `title` (`AppTitleStrategy` → "Pantalla · POS Híbrido"). `loadingInterceptor` cuenta las
peticiones en curso para la barra de carga superior (`SKIP_GLOBAL_LOADING` la omite).

Componentes compartidos (UX-2): `shared/table/data-table` (paginada en el servidor con `queryChange`, o lista en
memoria con `items`; celdas por tipo y plantillas `appCell`; tarjetas en móvil), `shared/forms/form-dialog`
(errores de campo del ProblemDetail vía `InlineErrorScope`), `page-header`, `empty-state`, `status-badge` (mapa
`shared/status.ts`), `stat-card` y `ConfirmService` para confirmaciones.

POS (UX-4): `features/pos/pos.component` orquesta carrito, cobro, tiquete, atajos y foco del lector; las piezas
`pos-header`, `product-grid` (favoritos locales en `favorites.ts`), `cart-panel` (emite cambios, no muta el carrito) y
`open-cash` (apertura guiada) son presentacionales o de una sola consulta. El cálculo vive en `sale-math.ts`
(totales, pagos, `stepQuantity`, `stockShortages`, `paymentsMissingReference`). `core/network/online.service` expone la
conexión del navegador.

Ayudas (UX-5): `shared/help` (glosario y `app-term`, consejos por ruta en `screen-help.ts` y `app-help-panel`, que el
shell muestra en un cajón) y `shared/tour` (recorrido guiado: `TourService` con el estado y lo ya visto, y
`app-tour-overlay` en la raíz de la app; cada pantalla define sus pasos y marca sus elementos con `data-tour`). Los
primeros pasos del inicio están en `features/onboarding`.
