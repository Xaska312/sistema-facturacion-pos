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
  finance/       finanzas: gastos, gastos fijos, retenciones, estado de resultados y tablero (decisiones 320–325)
  credit/        fiado con cupo y abonos (decisión 255)
  orders/        pedidos por encargo con anticipos y entregas (decisión 258)
  quotes/        cotizaciones (decisión 260)
  dining/        restaurante: mesas, cuentas, comandas, cocina en tiempo real (Fase 12b)
  purchasing/    compras, recepción de facturas (XML de la DIAN o leídas con IA), cuentas por pagar, qué comprar
  pharmacy/      droguería: dispensación, calidad e informe de la visita (Fase 13)
  ai/            XASKA IA (Aska): preguntas, resumen del día, cargar catálogo e inventario, lectura de recibos
  subscription/  planes, suscripciones, extras y topes de XASKA IA                 -> platform.*
  billing/       planes y pagos con Bre-B, precios públicos, referidos y aliados   -> platform.*
  mail/          correos (plantillas, envío)
  location/      catálogo DIVIPOLA: los 33 departamentos y los 1.122 municipios (decisión 328) -> platform.*
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

Cambio de costo (decisión 334): el costo de un producto que ya maneja el inventario también se cambia a mano o por
importación; el catálogo llama a `StockPresence.recordCostChange`, que deja un movimiento `COST_CHANGE` con cantidad 0
en cada sede con saldo (el invariante no cambia) y el promedio sigue desde el costo nuevo.

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

## Finanzas: gastos (decisión 320)
`finance` guarda los gastos (`expenses`) con su categoría. Un gasto en efectivo le pide a la caja, por `CashApi`, que
saque la plata de la sesión abierta de quien lo registra (movimiento `EXPENSE` con referencia al gasto) y, al anularlo,
que la devuelva (`EXPENSE_VOID`); con otro medio de pago no toca la caja. La caja no conoce los gastos. El listado une
`expenses` con los egresos manuales de caja sin clasificar, así los de antes aparecen sin copiarlos. Los pagos a
proveedores por mercancía no son gastos: ya entran como costo de lo vendido.

Los gastos fijos (decisión 321) no guardan lo pendiente: `RecurringSchedule` calcula las fechas y
`recurring_expense_occurrences` solo guarda las pagadas (con su gasto) y las saltadas. Pagar uno crea un gasto normal.

Las retenciones (decisión 322) son una línea de pago con el medio "Retención". Ventas y pedidos le piden a `finance`, por
`WithholdingApi`, que valide el detalle y lo guarde; `finance` no conoce ventas ni pedidos más que por SQL de lectura.

El estado de resultados (decisión 323) lee las ventas con SQL, como `reporting`, y suma los gastos y las retenciones
con los servicios de `finance`.

El tablero de Finanzas (decisión 324) no guarda nada: junta el estado de resultados, el flujo de las cajas, los saldos
de fiados, pedidos y proveedores (por sus servicios de consulta) y calcula el punto de equilibrio en el servidor.

Aska usa las finanzas (decisión 325) desde `ai`, que depende de los servicios de `finance` (como ya dependía de
`reporting`, `credit` o `purchasing`); `finance` no conoce la IA. Leer un recibo no guarda nada: el formulario del gasto
llama luego a la API de gastos de siempre.

## Frontend: versiones
Angular 21 con PrimeNG 21 (licencia MIT) y `@primeuix/themes`, TypeScript 5.9, zone.js, Karma y Jasmine; Node 24 en
Docker y CI (decisiones 329–330). Desde la 22, PrimeNG pide una licencia con llave anual: antes de subir a Angular 22
se reemplazan sus componentes por componentes propios.

## Frontend: sistema de diseño
Los colores viven solo en `frontend/src/styles.css` como tokens CSS (`--surface`, `--text`, `--brand`, `--success`,
`--warning`, `--danger`…) con su versión oscura bajo `.app-dark`. Tailwind los expone con `@theme`
(`bg-surface`, `text-muted`, `text-brand`, `bg-danger-soft`… y la utilidad `card`) y quita sus paletas propias;
PrimeNG usa la misma paleta con el preset `core/theme/app-preset.ts` (`definePreset(Aura, …)`,
`darkModeSelector: '.app-dark'`). `ThemeService` guarda claro/oscuro/sistema en `localStorage` y `public/theme-init.js`
(cargado desde `index.html`, sin scripts en línea por la CSP) aplica la clase antes del primer render. `tools/check-colors.mjs` (en CI) rechaza colores literales en `src/app`.

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

## Auditoría
Dos registros, ambos solo inserción (triggers): el `audit_log` de cada negocio (cambios, ventas, cajas, entradas y
salidas del negocio, exportaciones; pantalla **Auditoría** con `audit:read`) y `platform.security_events`
(inicios de sesión, intentos fallidos, bloqueos, límites superados, negocios creados; solo administradores de
plataforma). Los eventos de error se guardan en la transacción del caso de uso, que no se revierte con ese error
(sin una segunda conexión por intento). Decisiones 168–178.

## Módulos del negocio, funciones del plan y token (decisiones 267 y 288)

El token de negocio lleva los permisos de los roles del usuario **filtrados** por dos cosas:

- **Módulos** (`BusinessModule`: fiados, pedidos, cotizaciones, tallas, báscula, adiciones, mesas, cocina,
  medicamentos): el dueño los prende en Ajustes; solo cuentan los que su plan incluye. Cada módulo encendido agrega la
  autoridad `module:<código>` y sus permisos solo llegan al token si está encendido.
- **Funciones del plan** (`PlanFeature`: compras, impresión directa, auditoría, traslados, caja por zona): las decide
  el plan más los extras que da el administrador (`SubscriptionApi.entitlements`). Agregan `plan:<código>` y, sin
  ellas, sus permisos salen del token.

`BusinessModule.effectivePermissions` arma la lista al entrar y al renovar la sesión (máx. 15 min). `PrivilegeGuard`
deja asignar roles con permisos de módulos o funciones apagados sin que nadie gane permisos. Los límites del plan
(sedes, usuarios, cajas) se revisan al crear o activar.

## Restaurante: cuentas, cocina y tiempo real

Las cuentas abiertas (`tabs`, `tab_items`) se vuelven ventas normales al cobrar (`SaleService.createForTab`), en la
caja de quien cobra o en la de la zona de la mesa (decisión 285). Las comandas (`kitchen_tickets`) van por estación.
Los cambios se avisan a las pantallas por **SSE** (`/api/v1/dining/events`, sin compresión en Caddy) y en memoria
(`InMemoryDiningEvents`); cada pantalla vuelve a pedir lo que cambió.

## Droguería: lotes y FEFO

`lots` y `lot_balances` llevan el saldo por lote (la suma nunca pasa de `stock_balances`; lo demás es "sin lote").
Las salidas toman primero lo que no tiene lote y luego el lote que vence antes (FEFO, `StockLedger.allocate`); los
vencidos no se venden. Compras, devoluciones, bajas, ventas y anulaciones mueven el lote correcto, y la trazabilidad
de un lote sale del libro de movimientos. La dispensación (`DispensationRules`) se valida dentro de la transacción de
la venta. Las lecturas de temperatura (`quality_readings`) son inmutables (trigger).

## XASKA Impresora (decisión 286)

Programa de Windows en Go (`frontend/print-agent`, sin dependencias) que escucha en `127.0.0.1:17777` solo para los
orígenes de XASKA y manda los bytes ESC/POS en RAW a la cola de Windows. La app arma el tiquete
(`core/printing/escpos.ts`) y le habla con `fetch` (nunca con `HttpClient`, para que el token no salga del navegador).
"Abrir cajón" primero queda en la auditoría (`POST /cash/drawer-openings`) y luego manda el pulso.

## Vender sin internet (decisiones 332–333)
```
Vender ──(con conexión)──▶ GET /sales/offline-catalog ──▶ IndexedDB (copia del catálogo por negocio, cada 10 min)
       └─ con la caja abierta ─▶ localStorage: la caja recordada (usuario, permisos, caja, ajustes, medios; sin token, 24 h)
Sin conexión (navegador sin red o 0/502–504):
   lector, F2 y precio ─▶ copia del catálogo
   cobrar ─▶ cola en IndexedDB {Idempotency-Key, venta con `offline: {number, soldAt}`} ─▶ tiquete "SIN CONEXIÓN"
Al volver la conexión (y cada 30 s): POST /sales en orden con la misma clave (no duplica);
   error de red → espera; 4xx → "con problema" con el motivo y "Reintentar" (nunca se borra sola)
```
`@angular/service-worker` (`ngsw-config.json`, solo en producción) guarda la app; si al abrirla la renovación del
token no llega al servidor y hay una caja recordada vigente, `AuthService.restore` abre la sesión sin token y la app va
a Vender. La primera petición con conexión recibe 401, el interceptor renueva el token con la cookie y repite.

## Producción
Un servidor con `docker compose` (`deploy/docker-compose.prod.yml`): **web** (Caddy con la app Angular compilada:
HTTPS automático, cabeceras de seguridad y `/api/*` → backend en el mismo dominio), **backend**, **postgres-db** y
**backup** (pg_dump diario cifrado a Google Drive con rclone y prueba de restauración semanal). Solo Caddy publica
puertos. El backend toma la IP real de `X-Forwarded-For` (`FORWARD_HEADERS_STRATEGY=native`) para los límites de
intentos y la auditoría, y se conecta con un usuario de PostgreSQL sin privilegios de superusuario. Las imágenes se
publican en ghcr.io desde GitHub Actions. Guía: [`DESPLIEGUE.md`](DESPLIEGUE.md); decisiones 156–167.
