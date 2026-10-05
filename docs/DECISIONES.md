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
7. `package.json` del frontend declaraba `primeng` y `@tailwindcss/postcss` pero el `package-lock.json` no los tenía (`npm ci` fallaba). Se regeneró con `npm install` y se commiteó (resuelto).

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

### Resultado del primer build real (2026-10-01)
La fase se escribió en un entorno sin acceso a Maven Central, npm ni Docker Hub, así que la primera compilación real fue en local (Windows, Docker Desktop):
- Compiló sin errores con Spring Boot 4.1.1 y la aplicación arrancó: la validación del modelo (`Instant` ↔ `timestamptz`) y springdoc 3.0.0 no dieron problemas.
- 20 de 21 tests pasaron a la primera. El fallo era del test, no del código: en Spring 7, `jsonPath("$[?(@.id == '…')].status").value(List.of(...))` devolvía `null`. Se reemplazó por `JsonPath.read` + AssertJ.

29. **Advertencias del IDE:** se desactivó `java.compile.nullAnalysis.mode` en `.vscode/settings.json`: con las anotaciones JSpecify de Spring 7, el análisis de nulos de JDT genera avisos falsos. No afecta a Maven ni al CI. Se reemplazaron también las APIs deprecadas en Spring 7 (`HttpStatus.UNPROCESSABLE_ENTITY` → `UNPROCESSABLE_CONTENT`).
30. **Entrega por parches:** durante la Fase 1 el asistente no tenía permiso de push al repositorio; los cambios se entregaron como archivos `.patch` (aplicados con `git am`) y el push lo hizo el equipo. Los `.patch` no se versionan.

## Fase 2 — Acceso y organización

31. **Invitaciones por enlace** (decisión del equipo). El administrador genera un enlace y lo comparte a mano (WhatsApp, correo); el envío automático por correo llega en la Fase 7. El token (32 bytes aleatorios) se entrega una sola vez y se guarda como SHA-256; vence en 7 días. La invitación vive en `platform.invitations` porque se consulta antes de que exista el miembro; roles y sucursales se guardan como IDs del schema del negocio (sin FK entre schemas) y se validan al crear y al aceptar.
32. **Aceptar exige iniciar sesión con el mismo correo** de la invitación (403 si no coincide). Si la persona no tiene cuenta, se registra y vuelve al enlace (`returnUrl`, solo rutas internas para evitar redirecciones abiertas).
33. **Token de invitación en el cuerpo**, no en la URL de la API (`POST /invitations/preview|accept`), para que no quede en logs de acceso. La vista previa es pública y tiene límite de peticiones.
34. **Una sola invitación pendiente por correo y negocio** (índice único parcial). Si la anterior venció, se revoca sola al invitar de nuevo; si sigue vigente, 409 (hay que revocarla para generar otro enlace).
35. **Anti-escalada de privilegios.** Nadie puede otorgar, quitar ni editar permisos que no tiene (al crear/editar/eliminar roles, invitar o cambiar roles de un miembro), comparando con los permisos de su token. Además: el rol OWNER no se asigna ni se edita, el propietario del negocio no se modifica y nadie se modifica a sí mismo. Así un rol personalizado con `members:manage` no puede convertir a nadie en ADMIN.
36. **Roles de sistema**: no se eliminan ni cambian de código; sus permisos sí se pueden ajustar (excepto OWNER). Los roles personalizados solo se eliminan si nadie los tiene asignados. Cuando en fases futuras se agreguen permisos, la migración que los cree debe otorgarlos también a OWNER (y ADMIN).
37. **Cambios de permisos y desactivación.** Los permisos van en el access token (15 min): un cambio de rol aplica en la siguiente renovación. Desactivar un miembro revoca sus refresh tokens de ese negocio, así que deja de poder renovar o volver a entrar; su access token vigente expira solo.
38. **Membresía vs. miembro.** Desactivar marca `members.active = false` (la membresía de plataforma sigue `ACTIVE`); select-tenant y refresh exigen ambas cosas. Re-invitar a un miembro desactivado lo reactiva con los roles nuevos.
39. **Ajustes tipados.** `GET/PUT /settings` usa un DTO con todos los campos en lugar de clave/valor libre: validación clara y contrato estable para el frontend. Se guardan en `business_settings` (clave/valor). Solo se admite la moneda COP por ahora. `BusinessSettingsApi` es la lectura para ventas e inventario.
40. **Sucursales y cajas.** El código no cambia después de creado. Siempre debe quedar al menos una sucursal activa. Desactivar en lugar de borrar. En Fase 5 se impedirá desactivar una caja con sesión abierta.
41. **DIVIPOLA parcial.** El entorno donde se escribió la fase no tenía acceso a internet, así que se sembraron los 33 departamentos y las 32 capitales (códigos verificables por patrón `xx001`) en vez de inventar códigos. El listado completo (~1.120 municipios) se cargará con una migración `V4` generada desde el archivo oficial del DANE/datos.gov.co. Las sucursales validan `cityCode` contra el catálogo (422 si no existe).
42. **Auditoría.** `audit_log` registra creación/cambio de sucursales, cajas, roles, miembros, invitaciones y ajustes, con antes/después en JSON (sin secretos ni tokens), actor e IP, en la misma transacción del cambio.
43. **Frontend.** Tabla genérica tipada `DataTableComponent<T>` con paginación del servidor; selects y listas de casillas nativos (estilo Tailwind) para evitar dependencias extra; diálogos y confirmaciones con PrimeNG. Ocultar botones por permiso es solo UX: el backend valida todo.

## Fase 3 — Catálogo y terceros

44. **Listas de precios** (decisión del equipo): la lista *General* es el precio del producto (`products.sale_price`) y de sus presentaciones; las demás listas guardan precios propios por producto y unidad en `price_list_items`. Si una lista no tiene precio para una unidad, se usa la General. El cliente sin lista usa la General (`customers.price_list_id` nulo).
45. **Todos los códigos de barras en una tabla** (`product_barcodes`, únicos en el negocio) con `unit_id` opcional: nulo = unidad base; si no, identifica una presentación. El prompt proponía `products.barcode` + `product_barcodes` + `product_unit_conversions.barcode`; una sola tabla garantiza unicidad global con una sola restricción y simplifica el lector.
46. **Códigos internos EAN-13** (decisión del equipo) con prefijo 29 (rango 20–29 reservado para uso interno en tienda) + secuencia por negocio + dígito de control. Se marcan `internal` para imprimir etiquetas más adelante.
47. **Edición de producto por reemplazo completo** (`PUT` con presentaciones, códigos y precios por lista). Internamente se compara con lo existente (actualiza, quita, agrega) en lugar de borrar y reinsertar, para no chocar con las restricciones únicas por el orden de escritura de Hibernate.
48. **Precios de presentación**: si la presentación no tiene precio propio, se calcula precio base × factor (redondeo HALF_UP a 2 decimales).
49. **Importación CSV** (decisión del equipo): todo o nada, validación previa (`dryRun`), actualización por SKU (las columnas ausentes conservan el valor actual), categorías nuevas creadas automáticamente (por nombre, sin distinguir mayúsculas), máximo 5.000 filas y 5 MB, UTF-8 obligatorio (Excel: *CSV UTF-8*). El separador se detecta (`;` en Excel en español). Números: un único separador seguido de exactamente 3 dígitos es de miles (`2.500` = 2500), si no es decimal (`2,5`). El lector CSV es propio (RFC 4180) para no agregar dependencias.
50. **Imágenes de producto**: fuera de esta fase (decisión del equipo).
51. **Impuestos**: tarifa 0 solo para tipos Exento/Excluido (evita confundir "IVA 0 %" con exento). El tipo no cambia después de creado; la tarifa sí (aplica a ventas futuras). No se desactivan impuestos, unidades ni categorías que usan productos activos.
52. **Terceros**: un documento = un tercero; puede ser cliente y proveedor (roles en `customers` y `suppliers`). Registrar como cliente un documento que ya es proveedor reutiliza el tercero y actualiza sus datos. Persona jurídica exige NIT; el DV del NIT se valida con el algoritmo de la DIAN. *Consumidor final* (CC 222222222222) es tercero del sistema y no se modifica.
53. **Permisos**: el CAJERO puede registrar clientes en caja (`parties:manage`, sembrado en Fase 1) pero no administra productos; el BODEGUERO administra productos pero no ve terceros.
54. **Búsquedas con LIKE** escapan `%`, `_` y `\` con `escape '\'` explícito (Hibernate/PostgreSQL no usan escape por defecto).
55. **Peticiones con booleanos opcionales** usan `Boolean` (no `boolean`): con Jackson 3 un primitivo ausente en el JSON puede rechazarse.

## Fase 4 — Inventario

56. **Costo promedio ponderado** (decisión del equipo), uno por producto para todo el negocio, guardado en `products.cost` (2 decimales, HALF_UP). Cada entrada con costo (saldo inicial, ajuste de entrada con costo; en Fase 7, compras) calcula `(existencia total × costo actual + cantidad × costo de entrada) / (existencia total + cantidad)`; si la existencia total es ≤ 0, el costo nuevo es el de la entrada. La existencia total se suma bajo el bloqueo del producto.
57. **Costo manejado por el inventario**: desde el primer movimiento `products.cost_locked = true` y el costo deja de editarse a mano (422) y por CSV (se conserva). Tampoco cambia la unidad base, porque saldos y kardex están en esa unidad.
58. **Salidas, traslados y conteos se valoran al costo promedio** y no lo cambian. Un ajuste de entrada sin costo entra al promedio actual.
59. **Conteo físico** (decisión del equipo): el documento guarda esperado (saldo bloqueado al registrar) y contado por línea; la diferencia se registra como `ADJUSTMENT_IN` o `ADJUSTMENT_OUT`. Sin diferencia no hay movimiento.
60. **Traslados inmediatos** (decisión del equipo): `TRANSFER_OUT` y `TRANSFER_IN` en la misma transacción; no hay estado "en tránsito".
61. **Inmutabilidad en la base de datos**: triggers que rechazan `UPDATE`/`DELETE` en `stock_movements`, `inventory_documents` e `inventory_document_lines`, además de `@Immutable` en JPA. Las correcciones se hacen con un nuevo ajuste.
62. **Orden del kardex** por `entry_no` (identidad de la base de datos), no por fecha: dos movimientos en el mismo instante quedan en el orden en que se registraron. Cada movimiento guarda `balance_after`.
63. **Concurrencia**: `StockLedger` es el único punto que modifica saldos. Bloquea en orden fijo, primero productos (los que recalculan costo o aún no tienen el costo manejado por el inventario) con `FOR NO KEY UPDATE`, y luego saldos (producto, sucursal) con `FOR UPDATE`. `FOR NO KEY UPDATE` no choca con los bloqueos de llave foránea que toma PostgreSQL al insertar movimientos, lo que evita interbloqueos. Si aun así hay uno, la API responde 409 para reintentar.
64. **Sin existencias negativas** desde documentos de inventario (422 *Existencias insuficientes*). El parámetro para permitir negativos llegará con ventas (Fase 5).
65. **Idempotencia**: `Idempotency-Key` opcional (8–100 caracteres `A-Z a-z 0-9 _ -`) en los `POST` que crean documentos; la misma clave devuelve el mismo documento. El frontend genera una por pantalla de edición.
66. **Límites**: hasta 500 líneas por documento, sin productos repetidos; cantidades > 0 (≥ 0 en conteos); decimales solo si la unidad base los admite. Costos unitarios con 2 decimales.
67. **Lotes**: `stock_balances.lot_id` existe para la Fase de lotes y vencimientos; hoy todos los saldos son sin lote.
68. **Sucursales por usuario**: `member_branches` aún no restringe las operaciones de inventario; cualquier usuario con el permiso opera en todas las sucursales. Se aplicará cuando la caja lo necesite (Fase 5).

## Fase 5 — Caja y ventas

69. **Medios de pago** (decisión del equipo): efectivo, tarjeta (datáfono externo, referencia opcional) y transferencia (Nequi, Daviplata, bancos), con pago mixto. Sembrados en `payment_methods` (V7); su administración queda para después. El crédito a clientes (cartera) es una fase posterior.
70. **Cierre ciego** (decisión del equipo): sin el permiso nuevo `cash:audit` (dueño, administrador y contador) el informe no muestra el esperado, la diferencia ni el desglose del efectivo ni el cobro por medio de pago. El cajero sí ve su lista de movimientos (necesaria para verificar lo registrado). V7 además **quita `cash:read` al rol Cajero**: ve solo sus sesiones, no las de los demás.
71. **Tiquete POS interno** (decisión del equipo) numerado `POS-n` desde `document_sequences` con la fila bloqueada: si la venta falla, el incremento se deshace (sin huecos). Un solo consecutivo por negocio; el prefijo y los rangos por resolución DIAN llegan con la facturación electrónica. El tiquete dice "Comprobante interno de venta".
72. **La venta exige caja abierta del usuario** (prompt). El rol Vendedor no tiene `cash:operate`, así que ve la pantalla de venta pero no puede cobrar; la preventa (vendedor arma, cajero cobra) queda para después.
73. **Precios del servidor**: precio por cliente (lista de precios, si no la General), impuesto del producto y descuento por línea (0–100 %). Si el precio de una línea o el total que mostró la pantalla difieren → 409 con el detalle. El frontend replica el cálculo (`sale-math.ts`) para mostrar el total; el servidor manda.
74. **Redondeo**: dinero a 2 decimales HALF_UP por línea (bruto, descuento, base, impuesto); con IVA incluido, base = total / (1 + tarifa) e impuesto = total − base. Los totales de la venta son la suma de las líneas. Se guardan totales por impuesto (`sale_tax_totals`).
75. **Descuentos**: por línea. Por encima de `max_discount_percent` (0 por defecto) exigen `sales:discount` → 403.
76. **Cambio solo en efectivo**: tarjeta + transferencia ≤ total; la suma de pagos ≥ total. Se guarda lo entregado (`tendered`) y lo aplicado (`amount`); a la caja entra el efectivo neto.
77. **Orden de bloqueos** (igual en todo el sistema, sin interbloqueos): venta (solo al anular) → sesión de caja `FOR SHARE` (el cierre toma `FOR UPDATE` y espera a las ventas en curso; una venta que llega después del cierre ve la sesión cerrada) → productos y saldos de inventario (`StockLedger`) → consecutivo `FOR UPDATE`.
78. **Idempotencia**: `Idempotency-Key` obligatoria en `POST /sales` (índice único). Repetirla devuelve la misma venta; si dos llegan a la vez, la segunda choca con el índice y devuelve la primera. Una clave usada por otro usuario → 409. En movimientos de caja es opcional y funciona igual.
79. **Anulación**: no se borra nada; estado VOIDED con motivo, `SALE_VOID` devuelve el inventario al costo promedio vigente (no recalcula el promedio; el reverso se permite aunque el producto se haya desactivado) y `SALE_VOID` de caja sale de la sesión original si sigue abierta o, si no, de la sesión abierta de quien anula (si no tiene, 422).
80. **Inmutabilidad en la base de datos**: triggers en `sales` (solo COMPLETED → VOIDED con sus campos de anulación), `sale_items`, `sale_payments`, `sale_tax_totals`, `cash_movements` y `cash_sessions` (solo OPEN → CLOSED; una sesión cerrada no cambia).
81. **Sucursales asignadas**: abrir caja exige que la caja sea de una sucursal del usuario (`member_branches`), salvo con `branches:manage`.
82. **Evento `SaleCompleted`/`SaleVoided`**: se publican dentro de la transacción (Spring `ApplicationEventPublisher`). La emisión electrónica futura los escuchará con `@TransactionalEventListener(AFTER_COMMIT)`.
83. **Pantalla de venta fuera del menú lateral** (`/pos`) para aprovechar la pantalla en tablet horizontal. El ancho del papel (58/80 mm) es una preferencia del equipo guardada en el navegador, no un ajuste del negocio.
84. **E2E**: proyecto aparte `e2e/` con `@playwright/test` 1.56.0 (para no tocar el lockfile del frontend). Corre contra la app levantada con docker compose; en GitHub Actions es un flujo manual (no bloquea los PR).

## Fase 6 — Reportes y dashboard

85. **Reportes incluidos** (decisión del equipo): además de ventas por rango, sucursal, vendedor y medio de pago, productos más vendidos y por categoría, utilidad (margen), impuestos e inventario valorizado.
86. **Modelo de lectura**: el módulo `reporting` consulta con SQL nativo (solo lectura) las tablas de ventas, catálogo, inventario y caja del negocio, sin pasar por los servicios de esos módulos. Es la excepción a "los módulos se hablan por interfaces": agrega datos de varios módulos y nunca escribe.
87. **Qué cuenta**: solo ventas COMPLETED; las anuladas se informan aparte (cantidad y total) en el resumen. Las fechas son las de registro de la venta en la zona horaria del negocio; la anulación no cambia la fecha de la venta.
88. **Utilidad** = base (sin impuestos ni descuentos) − costo de lo vendido, con el costo promedio que quedó guardado en cada línea al vender (no el costo de hoy). Margen = utilidad / base.
89. **Inventario valorizado**: existencias actuales × costo promedio actual del producto, por sucursal. El valor a una fecha pasada queda para después (requiere reconstruir saldos desde el kardex).
90. **Rango máximo** de 367 días por consulta (un año completo comparable) para acotar el costo de las consultas.
91. **Gráficas sin librerías** (decisión del equipo, revisable): barras con HTML/CSS en un único componente `app-bar-chart`; cambiar a una librería (p. ej. Chart.js) solo toca ese componente.
92. **Tablero**: con `reports:read` se ve el del negocio; sin él pero con `sales:read` (cajero, vendedor) se ven "Mis ventas de hoy". El bodeguero no ve ventas.
93. **CSV para Excel en español** (decisión del equipo): `;`, coma decimal, sin separador de miles, UTF-8 con BOM. Los textos que empiezan por `= + - @`, tabulador o retorno llevan `'` delante (inyección de CSV). El detalle de ventas admite hasta 100.000 filas; si el rango tiene más, responde 422 pidiendo un rango más corto (no se corta en silencio).
94. **Índices** (`V8`): ventas COMPLETED por fecha (parcial), ventas por vendedor y fecha, líneas por venta y producto, pagos por medio y venta.
95. **Zona horaria con nombre**: los ajustes solo aceptan zonas IANA (`America/Bogota`, `UTC`…), no desplazamientos fijos (`-05:00`), porque PostgreSQL interpreta el signo de esos desplazamientos al revés en `AT TIME ZONE` y los reportes agruparían mal por día y hora.

## Fase UX-1 — Fundamentos: tema, tokens, iconos y shell

96. **Paleta de marca "Turquesa comercio"** (decisión del usuario, entre dos propuestas): turquesa 700 `#0f766e` en claro y 400 `#2dd4bf` en oscuro, neutros fríos ligeramente verdosos. Todas las combinaciones de texto (normal, secundario, sobre la marca y sobre los fondos de estado) superan 4,5:1 en ambos temas; los bordes de campo, 3:1 (WCAG 1.4.11).
97. **Tokens únicos en `styles.css`** (`:root` y `.app-dark`). Tailwind los expone con `@theme inline` y se borran sus paletas (`--color-*: initial`): una clase como `bg-slate-50` ya no genera CSS. El preset de PrimeNG repite la paleta en hexadecimal (PrimeNG necesita escalas 50–950); si se cambia un color hay que tocar los dos archivos.
98. **Sin colores literales** en `frontend/src/app`: `tools/check-colors.mjs` corre en CI (`npm run check:colors`). Se permiten en la paleta de PrimeNG y en el tiquete (`receipt.component.ts`, que se imprime siempre en negro sobre blanco); una línea puntual puede marcarse con `color-literal-ok` explicando el motivo.
99. **Modo oscuro** con la clase `app-dark` en `<html>` (PrimeNG `darkModeSelector: '.app-dark'`, Tailwind `@custom-variant dark`). Preferencia claro/oscuro/sistema en `localStorage` (`pos.theme`, no es sensible); "sistema" es el valor por defecto. Un script en línea en `index.html` aplica la clase antes del primer render; si en producción se activa una CSP estricta, ese script necesita su hash en `script-src`.
100. **Menú contraído** recordado en `localStorage` (`pos.sidebar-collapsed`). Por debajo de 768 px el menú es un cajón (`p-drawer`) con botón hamburguesa; la tablet horizontal (1024 px) muestra el menú lateral.
101. **Sucursal en la barra superior**: la sesión no tiene una sucursal "actual" (el usuario puede tener varias y la caja define la sucursal al vender), así que la barra muestra solo el negocio. La sucursal y la caja se mostrarán en la cabecera del POS (UX-4). Sin cambios de backend.
102. **Migas de pan derivadas de la URL y del menú** (`buildBreadcrumbs`): Inicio › sección › opción del menú de ruta más larga › título de la página. No hace falta declarar migas en cada ruta.
103. **Sin permiso → página 403** (`/app/sin-permiso`) en lugar de volver al inicio en silencio. Las rutas desconocidas muestran una página 404 (dentro del menú si la ruta empieza por `/app`, a pantalla completa si no) en lugar de redirigir.
104. **Barra de carga global** ligada a las peticiones HTTP en curso; aparece tras 200 ms para no parpadear. Una petición puede omitirla con `SKIP_GLOBAL_LOADING` (para consultas en segundo plano futuras).
105. **Tipografía e iconos autohospedados**: `@fontsource/inter` (latín, pesos 400/500/600) y `primeicons`, ambos desde `node_modules` (sin CDN).
106. **Textos internos de PrimeNG en español** (`core/theme/primeng-es.ts`: botón "Cerrar" de los diálogos, medidor de contraseña, Sí/No).
107. **Bordes por defecto** con el color del tema (`--surface-border`): Tailwind 4 usa `currentColor`, por eso las filas de las tablas se veían oscuras. Los `select`/`input type="date"` nativos que quedan toman fondo y borde del tema mientras se migran a PrimeNG (UX-2).
108. Se borraron `app.component.html` y `app.component.css`: eran la plantilla de ejemplo de Angular CLI y el componente usa un template en línea.
109. **Respuestas a las preguntas abiertas de UX** (sin respuesta del usuario, se tomó la primera opción): la comparación por hora contra ayer del tablero (UX-3) queda como propuesta de backend; los favoritos del POS (UX-4) serán locales al equipo más la grilla por categoría; el "descartar" de primeros pasos (UX-5) se guarda en `localStorage` por usuario y negocio; Inter con pesos 400/500/600; la revisión de colores corre en CI.

## Fase UX-2 — Componentes compartidos

110. **Tabla propia en lugar de `p-table`** (el prompt permitía "o equivalente"): `app-data-table` es una tabla HTML con piezas de PrimeNG (`p-paginator`, `p-skeleton`). Con `p-table` había que repetir en cada pantalla las plantillas de cabecera, cuerpo, vacío y carga; además pesa más y su API de carga diferida no aporta nada aquí (toda la paginación ya es del servidor). Tipada con genéricos (`ColumnDef<T>`), sin `any`.
111. **Tabla o tarjetas, no ambas**: en móvil se pinta la vista de tarjetas en lugar de ocultar la tabla con CSS (`ViewportService` con `matchMedia`). Así cada texto aparece una sola vez para los lectores de pantalla y para los selectores del e2e.
112. **Orden solo donde el backend lo permite**: `PageRequests` del backend acepta una lista blanca de campos por endpoint; la tabla solo hace clicables esas columnas (`sortField`). El ciclo es ascendente → descendente → orden predeterminado de la pantalla. Ventas, caja, documentos, kardex y terceros no aceptan `sort` (no se cambió el backend).
113. **Búsqueda con debounce de 350 ms** (Enter busca de inmediato) y siempre vuelve a la página 1. Solo en las listas cuyo endpoint acepta `search`: productos, existencias, clientes/proveedores, usuarios y ventas.
114. **Tamaño de página** 10/20/50/100 (el backend limita a 100). Se agregó el parámetro `size` (con el valor de antes por defecto) a `SalesApi.search`, `CashApi.sessions`, `InventoryApi.documents` e `InventoryApi.kardex`; el contrato del API no cambió.
115. **Errores de formulario en línea**: mientras `app-form-dialog` guarda, el interceptor no muestra toast para los 4xx (`InlineErrorScope`); el diálogo pone los errores de campo del ProblemDetail en el control con el mismo nombre y los demás arriba del formulario. Los 5xx y la falta de conexión siguen como toast. Si en ese instante falla con 4xx otra petición en segundo plano, su toast no se muestra (caso raro, aceptado).
116. **Nombres de campo en español** en los mensajes de error (`FIELD_LABELS` en `core/errors/problem.ts`); si un campo no está en la lista se muestra solo el mensaje, nunca el nombre técnico.
117. **Mapa único de estados** (`shared/status.ts`): texto y color de cada estado (activo/inactivo con género, abierta/cerrada, registrada/anulada, pendiente/vencida, existencias bajo mínimo/normal/sobre máximo, arqueo cuadrada/faltante/sobrante). Las insignias usan los tokens `*-soft` (contraste AA en ambos temas).
118. **Confirmaciones** con `ConfirmService`: el botón principal dice la acción ("Desactivar sucursal"), las destructivas van en rojo con icono de advertencia, el otro botón dice "Cancelar" y tiene el foco por defecto.
119. **Diálogo genérico con formularios reactivos o borradores ngModel**: Sucursales y Cajas usan `FormGroup` (validación y errores por campo); Clientes/Proveedores, Ajustes de catálogo y Anular venta usan su borrador con `[dirty]` e `[invalidMessage]`. El contenido no lleva `<form>` propio: el diálogo lo pone (Enter envía).
120. **El estado de una fila pasa a una columna "Estado"** en lugar de mezclarse con los botones de acción.
121. Quedan con tabla propia las tablas editables (líneas de documentos de inventario, carrito del POS) y Reportes; Reportes se migra en UX-3 y el POS en UX-4.
