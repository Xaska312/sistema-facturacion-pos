# POS SaaS Híbrido — Monorepo

POS web multi-negocio para comercios en Colombia. Backend Spring Boot 4.1 (Java 21) + PostgreSQL 16, frontend Angular 19 + PrimeNG 19.

- Arquitectura: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- API: [`docs/API.md`](docs/API.md)
- Decisiones: [`docs/DECISIONES.md`](docs/DECISIONES.md)
- Mejora de interfaz (UX): [`docs/UX-1.md`](docs/UX-1.md)

## Estado de las fases
| Fase | Estado |
|---|---|
| 0 — Esqueleto | ✅ Completada |
| 1 — Identidad, tenancy y aprovisionamiento | ✅ Completada (validada en local el 2026-10-01: 21 tests en verde y app probada) |
| 2 — Acceso y organización | ✅ Completada (validada en local el 2026-10-01: 46 tests en verde y app probada) |
| 3 — Catálogo y terceros | ✅ Completada (validada en local el 2026-10-02: tests en verde y app probada) |
| 4 — Inventario | ✅ Completada (validada en local el 2026-10-03: tests en verde y app probada) |
| 5 — Caja y ventas | ✅ Completada (probada en local el 2026-10-05 con la cuenta demo) |
| 6 — Reportes y dashboard | 🧪 Entregada, pendiente de validar en local |
| 7 — Endurecimiento para producción | ⏳ Siguiente |

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

## Datos de demostración
Con la app levantada, crea un negocio de prueba que usa todas las funciones (sucursales, cajas, usuarios por rol,
catálogo, clientes, inventario, ventas, anulación y cierres de caja):
```powershell
node tools/demo/seed-demo.mjs
```
Sin Node instalado, con Docker:
```powershell
docker run --rm -v "${PWD}/tools:/tools" -e POS_API=http://host.docker.internal:8080 node:22-alpine node /tools/demo/seed-demo.mjs
```
Usuarios (contraseña `DemoPos2026`): `dueno@tienda-demo.test`, `cajero@tienda-demo.test`, `vendedor@tienda-demo.test`,
`bodega@tienda-demo.test`. Para otro negocio demo: `DEMO_SLUG=otro_nombre`.

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
**E2E (Playwright)**: con la app levantada (`docker compose up`), en otra terminal:
```powershell
cd e2e; npm install; npx playwright install chromium; npx playwright test
```
Crea un usuario y un negocio nuevos por la API y recorre login → abrir caja → vender → cerrar caja en el navegador.
El reporte queda en `e2e/playwright-report`. En GitHub se puede lanzar a mano con el flujo *E2E POS Híbrido*.

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

---

## Fase 2 — Acceso y organización ✅

Validada en local: 46 tests en verde; invitación por enlace, menú por permisos y cambios de rol probados en la app.

**Incluye**
- **Usuarios:** invitar por enlace (correo + roles + sucursales), ver y revocar invitaciones, editar roles y sucursales de cada miembro, desactivar/activar. Página pública `/invitacion/<token>` para aceptar (con registro o inicio de sesión y regreso automático).
- **Roles y permisos:** crear, editar y eliminar roles con permisos agrupados por módulo. Reglas anti-escalada (nadie otorga permisos que no tiene; OWNER intocable).
- **Sucursales** (crear, editar, municipio DIVIPOLA, activar/desactivar) y **cajas registradoras** por sucursal.
- **Ajustes del negocio:** vender sin existencias, precios con IVA incluido, zona horaria, moneda, descuento máximo, pie del recibo.
- **Auditoría** de todos esos cambios y **menú por permisos** con sección *Configuración*.

**Criterios de aceptación y tests**
| Criterio | Test |
|---|---|
| Un CASHIER no ve ni puede llamar endpoints de configuración | `ConfigurationAccessIT` (backend) y `menu.spec.ts` (frontend) |
| Invitar, aceptar con el correo correcto, revocar, vencer, re-invitar | `InvitationFlowIT` |
| Nadie escala privilegios; OWNER y propietario protegidos | `PrivilegeEscalationIT` |
| Roles y miembros (CRUD, permisos aplicados al renovar, desactivar corta el acceso) | `RoleAndMemberManagementIT` |
| Sucursales, cajas, ajustes y DIVIPOLA | `OrganizationIT` |
| Aislamiento entre negocios en cada módulo nuevo | `ModuleIsolationIT` |

**Probar a mano**
1. Entra como propietario → *Configuración → Usuarios → Invitar usuario*. Elige rol **Cajero** y la sede principal → *Generar enlace* → copia el enlace.
2. Abre el enlace en otra ventana privada → *Crear cuenta* con ese correo → vuelve sola a la invitación → *Aceptar invitación*.
3. Como cajero, el menú solo muestra *Inicio* y *Sucursales*; si escribes `/app/ajustes` en la barra, te devuelve al inicio, y la API responde 403.
4. Como propietario, crea un rol en *Roles y permisos*, cámbiale permisos al cajero en *Usuarios* o desactívalo.

**Nota DIVIPOLA:** por ahora el catálogo trae los 33 departamentos y sus capitales. El listado completo de municipios se agregará con una migración generada desde el archivo oficial del DANE.

---

## Fase 3 — Catálogo y terceros ✅

**Incluye**
- **Productos:** SKU, nombre, categoría, unidad base, impuesto, costo, precio, control de inventario. Búsqueda por nombre, SKU o código de barras.
- **Presentaciones:** p. ej. *Caja = 24 UND*, con precio propio o calculado (precio base × factor).
- **Códigos de barras:** varios por producto, únicos en el negocio; cada uno identifica la unidad base o una presentación. Botón *Generar código interno* (EAN-13 válido con prefijo 29).
- **Lector:** `GET /products/lookup?code=` resuelve código de barras o SKU → producto, unidad, factor y precio (lo usará la pantalla de venta).
- **Listas de precios:** la *General* es el precio del producto; se pueden crear otras (Mayorista, Promoción…) con precios por producto y unidad, y asignarlas a clientes. Si una lista no tiene precio, se usa el de la General.
- **Ajustes de catálogo:** categorías en árbol, unidades, impuestos (IVA 19 %, 5 %, exento, excluido, INC) y listas de precios.
- **Importación CSV** (desde Excel): validar primero, luego importar; todo o nada; un SKU existente se actualiza; categorías nuevas se crean solas.
- **Clientes y proveedores:** persona natural o jurídica, tipos de documento colombianos, **dígito de verificación del NIT** validado, municipio DIVIPOLA, lista de precios y cupo para clientes. Un mismo tercero puede ser cliente y proveedor. *Consumidor final* sembrado y protegido.

**Tests**
| Qué | Test |
|---|---|
| Datos base, categorías, productos, presentaciones, códigos, listas, lector, validaciones | `CatalogIT` |
| Importación CSV (formato Excel, errores por fila, todo o nada, actualización por SKU) | `ProductImportIT` |
| Clientes/proveedores, NIT y DV, documento duplicado, permisos por rol, aislamiento | `PartiesIT` |
| DV del NIT, EAN-13, lector CSV y números con formato colombiano | `NitTest`, `Ean13Test`, `CsvTest` |

**Probar a mano**
1. *Catálogo → Ajustes de catálogo*: crea las categorías *Bebidas* y, dentro, *Gaseosas*; crea la lista *Mayorista*.
2. *Catálogo → Productos → Nuevo producto*: agrega una presentación *CJ* de 24, un código de barras para la unidad y otro para la caja (o *Generar código interno*), y un precio en *Mayorista*.
3. *Importar CSV*: descarga la plantilla, llénala en Excel, guárdala como **CSV UTF-8**, *Validar* y luego *Importar*.
4. *Terceros → Clientes*: registra una empresa con NIT (el DV se calcula solo) y asígnale la lista *Mayorista*.
5. Como cajero: ve productos y registra clientes, pero no puede crear productos ni entrar a *Ajustes de catálogo*.

## Fase 4 — Inventario ✅

**Incluye**
- **Existencias por sucursal** en unidad base, con mínimo y máximo por producto y sucursal y **alertas** de existencias bajas (también en *Inicio*).
- **Kardex** por producto: cada movimiento con fecha, tipo, cantidad, costo, saldo resultante, documento, motivo y responsable. Filtro por sucursal y fechas.
- **Documentos de inventario**, numerados `INV-000001`:
  - **Saldo inicial**: solo si el producto no tiene movimientos en la sucursal.
  - **Ajuste**: entradas o salidas, con motivo obligatorio. Una entrada con costo recalcula el promedio.
  - **Traslado** entre sucursales: sale de una y entra a la otra en la misma operación (inmediato).
  - **Conteo físico**: se registra lo contado; el sistema calcula la diferencia contra el saldo y la ajusta.
- **Costo promedio ponderado**: lo calcula el inventario y queda en el producto. Desde el primer movimiento, el costo y la unidad base no se editan a mano (ni por CSV).
- **Movimientos inmutables**: la base de datos rechaza cualquier `UPDATE` o `DELETE` sobre movimientos y documentos. Para corregir se registra un ajuste.
- **Sin sobreventa**: operaciones simultáneas sobre el mismo producto se ejecutan una tras otra; ninguna salida deja el saldo negativo.
- **`Idempotency-Key`**: reenviar la misma solicitud (doble clic, reintento) no crea otro documento.
- **Cantidades por presentación**: escanear el código de la caja agrega la línea en *CJ*; se convierte a unidad base.

**Tests**
| Qué | Test |
|---|---|
| Saldo = suma de movimientos tras saldo inicial, ajustes, traslado y conteo; kardex; promedio ponderado; costo bloqueado | `InventoryIT.everyOperationKeepsBalanceEqualToSumOfMovements` |
| Existencias insuficientes, validaciones, idempotencia, alertas, permisos por rol, aislamiento | `InventoryIT` |
| 12 salidas simultáneas con existencia 5 → exactamente 5 aceptadas; entradas con costo y salidas simultáneas sin conflictos | `InventoryIT` |
| La base de datos rechaza editar o borrar movimientos | `InventoryIT.movementsAndDocumentsAreImmutableInTheDatabase` |
| Fórmula del promedio ponderado | `WeightedAverageTest` |

**Probar a mano**
1. Crea un producto *Gaseosa* con presentación *CJ* de 12 y un código de barras para la caja.
2. *Inventario → Movimientos → Saldo inicial*: 24 UND a costo 1.000.
3. *Ajuste*: entrada de 1 caja (escanea o escribe el código de la caja) a 24.000 la caja. El costo del producto queda en 1.333,33 y ya no se puede editar.
4. Crea la sucursal *Norte* y haz un *Traslado* de 10 UND. Revisa *Existencias* en cada sucursal.
5. *Conteo físico* en la principal: escribe una cantidad distinta de la actual y mira la diferencia antes de guardar.
6. En *Existencias*, pon mínimo 30 al producto: aparece la alerta aquí y en *Inicio*.
7. Abre el *Kardex* del producto: el saldo de cada línea es el anterior más la cantidad.
8. Como vendedor o cajero: ve existencias y kardex, pero no registra ajustes ni traslados.

## Fase 5 — Caja y ventas ✅

**Incluye**
- **Caja**: abrir con base de efectivo (una sesión abierta por caja y por usuario; solo en cajas de las sucursales asignadas), ingresos, egresos y retiros con motivo, **cierre con arqueo ciego**: el cajero cuenta sin ver el esperado; el sistema calcula esperado = base + movimientos en efectivo y guarda la diferencia. Una sesión cerrada no se reabre.
- **Informe de caja** parcial (X) y de cierre (Z): ventas, anulaciones, cobrado por medio de pago, ingresos, egresos, retiros, esperado, contado y diferencia (estos últimos con el permiso nuevo `cash:audit`: dueño, administrador y contador).
- **Pantalla de venta** (`/pos`, a pantalla completa, sirve en tablet horizontal): lector de códigos siempre enfocado (`3*código` = 3 unidades), **F2** buscar por nombre, **F4** cobrar, **Esc** cancelar; cliente con su lista de precios; descuento por línea (por encima del límite del negocio exige `sales:discount`); **pago mixto** (efectivo, tarjeta, transferencia) con cálculo del cambio (solo en efectivo).
- **Venta en una sola transacción**: precios, impuestos y descuentos los recalcula el servidor (si la pantalla mostraba otro precio o total → 409 y la pantalla se actualiza); descuenta inventario (`SALE` con saldo resultante) sin permitir existencias negativas; registra el efectivo en la caja; consecutivo **POS-1, POS-2…** sin huecos; `Idempotency-Key` obligatoria (un doble clic o reintento no duplica la venta).
- **Tiquete** imprimible en impresora térmica de **58 u 80 mm** (se elige en el diálogo del tiquete y queda guardado en el equipo).
- **Ventas**: historial con filtros, detalle, reimprimir y **anular** con motivo (`sales:void`): no se borra nada, el inventario vuelve (`SALE_VOID`) y el efectivo sale de la caja de la venta o, si ya se cerró, de la caja abierta de quien anula.
- Ventas, pagos, impuestos y movimientos de caja son **inmutables** en la base de datos (triggers). Cada venta guarda cliente identificado y totales por impuesto para la facturación electrónica futura y publica el evento `SaleCompleted`.

**Tests**
| Qué | Test |
|---|---|
| Venta con IVA, pago mixto, cambio, inventario, kardex, informe, consecutivos | `SalesIT.saleUpdatesStockCashAndNumbering` |
| Precio distinto → 409, descuentos con y sin permiso, precios sin IVA | `SalesIT.serverRecalculatesPricesAndAppliesDiscountRules` |
| **20 ventas simultáneas del último producto → exactamente 1 aceptada** | `SalesIT.twentyConcurrentSalesOfTheLastUnitOnlyOneSucceeds` |
| **Misma Idempotency-Key (también simultánea) → una sola venta** | `SalesIT.sameIdempotencyKeyCreatesOneSale` |
| Anulación (inventario y efectivo, sesión cerrada), inmutabilidad, permisos por endpoint, aislamiento, token sin negocio | `SalesIT` |
| Arqueo ciego, una sesión por caja y por usuario, sucursales asignadas, idempotencia de movimientos | `CashIT` |
| Impuestos, totales, cambio, arqueo | `SaleCalculatorTest`, `CashCountTest`, `sale-math.spec.ts` |
| Flujo completo en el navegador | `e2e/tests/venta.spec.ts` (Playwright) |

**Probar a mano**
1. Crea un producto con código de barras y dale saldo inicial (Fase 4).
2. *Ventas → Mi caja*: elige la caja, escribe la base (p. ej. 50.000) y *Abrir caja*.
3. *Ir a vender*: escanea o escribe el código y Enter (o `2*código`). F2 busca por nombre. *Cambiar cliente* aplica su lista de precios.
4. **F4**: paga parte con tarjeta y el resto en efectivo con un billete mayor; mira el cambio. *Registrar venta* → tiquete → *Imprimir* (elige 58 u 80 mm).
5. *Ventas → Ventas*: abre la venta, reimprímela y anúlala con un motivo. Revisa que la existencia volvió.
6. *Mi caja*: registra un retiro y *Cerrar caja* contando el efectivo. Como dueño, *Historial de caja* muestra el esperado y la diferencia; como cajero, no.
7. Como vendedor (sin `cash:operate`): ve la pantalla de venta pero no puede cobrar sin caja abierta; no ve *Mi caja* ni puede anular.

## Fase 6 — Reportes y dashboard 🧪

**Incluye**
- **Tablero en Inicio** (permiso `reports:read`: dueño, administrador, contador): ventas de hoy frente a ayer, número de ventas, ticket promedio, utilidad y margen; gráficas de ventas por hora, últimos 7 días, productos más vendidos y medios de pago.
- **Mis ventas de hoy** en Inicio para quien no tiene reportes (cajero, vendedor): total, número de ventas, ticket promedio y medios de pago de sus propias ventas.
- **Reportes** (*Reportes* en el menú), con rango de fechas (atajos: hoy, ayer, 7 días, este mes, mes anterior), sucursal y vendedor:
  - Resumen: ventas brutas, descuentos, base, impuestos, total, ticket promedio, **utilidad** (base − costo promedio guardado en cada venta) y margen; anuladas aparte.
  - Por día, por sucursal, por vendedor y por medio de pago.
  - **Productos más vendidos** (por valor o cantidad) y por **categoría**, con utilidad y margen.
  - **Impuestos**: base e impuesto por tipo y tarifa (IVA 19 %, 5 %, INC…).
  - **Inventario valorizado**: existencias × costo promedio por sucursal.
- **Exportar CSV** en cada reporte, listo para Excel en español (separador `;`, coma decimal, tildes correctas) y protegido contra fórmulas maliciosas. También el detalle de ventas una a una.
- Gráficas propias (HTML/CSS, sin librerías) en un solo componente (`app-bar-chart`), para poder cambiarlas por una librería más adelante.
- Índices nuevos para las consultas por fecha, vendedor, producto y medio de pago (`V8`).

**Tests**
| Qué | Test |
|---|---|
| Cifras de todos los reportes sobre un escenario conocido (5 ventas, 1 anulada, 2 sucursales, 2 vendedores, IVA 19 y 5) | `ReportsIT.reportsMatchTheRegisteredSales` |
| CSV: BOM, `;`, coma decimal, nombre de archivo, todos los reportes | `ReportsIT.csvExportsAreReadyForExcelInSpanish` |
| Rango inválido, permisos por rol, aislamiento entre negocios, token sin negocio | `ReportsIT.periodValidationPermissionsAndIsolation` |
| Formato CSV e inyección de fórmulas; rangos y márgenes | `CsvWriterTest`, `ReportPeriodTest` |
| Gráficas, rangos rápidos, nombre del archivo descargado, API | `bar-scale.spec`, `periods.spec`, `download.spec`, `reports.api.spec` |

**Probar a mano**
1. Ejecuta `node tools/demo/seed-demo.mjs` (crea un negocio demo nuevo con ventas de hoy).
2. Entra como `dueno@tienda-demo.test`: en *Inicio* aparece el tablero del día.
3. *Reportes*: revisa cada pestaña, cambia el rango y la sucursal, y exporta el CSV; ábrelo en Excel.
4. Entra como `cajero@tienda-demo.test`: en *Inicio* ve solo *Mis ventas de hoy* y no tiene *Reportes*.
