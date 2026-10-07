# API (v1)

Base: `/api/v1`. Errores en `application/problem+json` (RFC 9457). **Dinero en pesos enteros** (Fase 7-6b): el total de cada línea de venta se redondea al peso; pagos, base de apertura, conteo y movimientos de caja con centavos → 400. Swagger UI en `/swagger-ui.html` con `OPENAPI_ENABLED=true`.

## Autenticación (plataforma)
| Método | Ruta | Token | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Crea la cuenta. `{email, password, fullName, phone?}` → 201. Envía el correo "Confirma tu correo" |
| POST | `/auth/login` | — | `{email, password}` → token de plataforma + cookie `pos_refresh` + `tenants[]`. 401 credenciales, 423 bloqueado |
| POST | `/auth/select-tenant` | cualquiera | `{tenantId}` → token de negocio + cookie. 403 sin membresía/negocio inactivo |
| POST | `/auth/refresh` | cookie | Rota la cookie y devuelve nuevo access token. 401 si expiró o fue reutilizada. Un token rotado hace menos de 30 s responde 401 sin cerrar las demás sesiones (otra pestaña); pasado ese margen se trata como robo |
| POST | `/auth/logout` | cookie | Revoca la cookie. 204 |
| GET | `/auth/me` | cualquiera | Usuario, `tenantId` y permisos del token |
| POST | `/auth/verify-email` | — | `{token}` del enlace del correo → 204. 422 si no existe, venció (24 h) o ya se usó |
| POST | `/auth/verify-email/resend` | cualquiera | Reenvía el correo (el enlace anterior deja de servir) → 204; nada si ya está confirmado. 429 si se pidió hace menos de un minuto |
| POST | `/auth/password-reset/request` | — | `{email}` → 204 **siempre** (no revela si la cuenta existe). Si existe, envía el enlace (vence en 1 h; máx. uno por minuto) |
| POST | `/auth/password-reset/confirm` | — | `{token, password}` → 204. Cambia la contraseña, desbloquea la cuenta, da el correo por confirmado, **cierra todas las sesiones** y avisa por correo. 422 enlace inválido/vencido/usado, 400 contraseña débil |

Respuesta de sesión:
```json
{ "accessToken": "...", "tokenType": "Bearer", "expiresIn": 900,
  "user": {"id": "...", "email": "...", "fullName": "...", "platformAdmin": false, "emailVerified": true},
  "tenantId": null, "permissions": [], "tenants": [ ... ] }
```

## Negocios (plataforma)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/tenants` | Negocios donde soy miembro activo o dueño |
| POST | `/tenants` | `{slug, legalName, tradeName, businessType:"RETAIL"}` → 201. **403 `code: EMAIL_NOT_VERIFIED`** si el dueño no ha confirmado su correo, 409 slug repetido, 422 tipo no disponible, 503 falló el aprovisionamiento |
| POST | `/tenants/{id}/retry-provisioning` | Solo el dueño y solo si está `FAILED` (409 si no; 404 si no es suyo) |

## Invitaciones (lado del invitado)
El token viaja en el cuerpo, nunca en la URL de la API.
| Método | Ruta | Token | Descripción |
|---|---|---|---|
| POST | `/invitations/preview` | — (público) | `{token}` → `{tenantName, email, invitedByName, status, expired, expiresAt}`. 404 si no existe |
| POST | `/invitations/accept` | cualquiera | `{token}` → `{tenantId, tenantName}`. 403 si el correo de la sesión no coincide, 409 usada/revocada o ya miembro, 422 vencida. Aceptar **no** confirma el correo (el token también lo tiene quien invita) |

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
| POST | `/members/invitations` | `members:manage` | `{email, roleIds[], branchIds[]}` → 201 `{invitation, token}`. Envía el correo de invitación; el token también se entrega **una sola vez** para compartir el enlace `<origen>/invitacion/<token>`. 409 si ya hay una pendiente o ya es miembro activo |
| POST | `/members/invitations/{id}/resend` | `members:manage` | → 200 `{invitation, token}`: revoca la invitación y crea otra igual (mismos roles y sucursales, 7 días más) con enlace nuevo, y la envía por correo. 409 si no está pendiente, **429** si se envió hace menos de un minuto. Auditoría `INVITATION_RESENT` |
| POST | `/members/invitations/{id}/revoke` | `members:manage` | 409 si no está pendiente |

Máximo **50 invitaciones** (nuevas o reenviadas) por negocio cada 24 horas: después, 429. Volver a invitar a un miembro desactivado exige poder gestionarlo (403 si tiene permisos que quien invita no tiene).

**Reglas anti-escalada** (403): nadie otorga, quita ni edita permisos que no tiene; el rol OWNER no se asigna;
el propietario no se modifica; nadie se modifica a sí mismo (422).

Paginación: `{ content, page, size, totalElements, totalPages }`.

## Permisos sembrados
`settings:read|manage`, `branches:read|manage`, `cash-registers:manage`, `members:read|manage`, `roles:manage`,
`products:read|manage`, `parties:read|manage`, `inventory:read|adjust|transfer`, `cash:operate|read|audit`,
`sales:create|read|void|discount`, `reports:read`, `audit:read` (Fase 7-2: OWNER, ADMIN y ACCOUNTANT).
Roles: OWNER y ADMIN (todos), CASHIER, SELLER, WAREHOUSE, ACCOUNTANT (ver `db/tenant/V2__seed_access_and_organization.sql`).

## Catálogo (Fase 3)
Leer: `products:read`. Modificar: `products:manage`.
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/products?search=&categoryId=&includeInactive=&page=&size=&sort=name,asc` | Busca por nombre, SKU o código exacto |
| GET | `/products/{id}` | Producto con presentaciones, códigos y precios por lista |
| POST | `/products` · PUT `/products/{id}` | Cuerpo completo (abajo). 409 SKU o código repetido; 422 referencias inválidas |
| POST | `/products/{id}/activate` · `/deactivate` | |
| GET | `/products/lookup?code=&priceListId=` | Código de barras o SKU → `{productId, sku, name, unitId, unitCode, factor, price, fromList, taxType, taxRate, trackInventory}`. 404 si no existe, 422 si está inactivo |
| POST | `/barcodes/internal` | `{barcode}` EAN-13 interno libre (prefijo 29) |
| POST | `/products/import?dryRun=true` (multipart `file`) | Reporte `{totalRows, toCreate, toUpdate, newCategories, errors[{row, message}], applied}`. Con `dryRun=false` importa solo si no hay errores |
| GET/POST | `/categories` · PUT `/categories/{id}` · POST `/{id}/activate`·`/deactivate` | Árbol con `parentId`; nombre único entre hermanas; sin ciclos |
| GET/POST | `/units` · PUT `/units/{id}` · activar/desactivar | Código 1–10 letras/números |
| GET/POST | `/taxes` · PUT `/taxes/{id}` · activar/desactivar | Tipos IVA, INC, EXEMPT, EXCLUDED (exento/excluido con tarifa 0) |
| GET/POST | `/price-lists` · PUT `/price-lists/{id}` · activar/desactivar | GET también con `parties:read`. La General no se desactiva |

Cuerpo de producto:
```json
{ "sku": "AGUA-600", "name": "Agua 600 ml", "description": null, "categoryId": null,
  "baseUnitId": "<UND>", "taxId": "<IVA19>", "cost": 800, "salePrice": 1500, "trackInventory": true,
  "conversions": [{ "unitId": "<CJ>", "factor": 24, "salePrice": 30000 }],
  "barcodes":   [{ "barcode": "7700000000017" }, { "barcode": "17700000000014", "unitId": "<CJ>" }],
  "listPrices": [{ "priceListId": "<MAYORISTA>", "unitId": null, "price": 1300 }] }
```
CSV de importación (separador `;` o `,`, UTF-8): `sku, nombre, codigo_barras, categoria, unidad, impuesto, costo, precio, controla_inventario, descripcion` (obligatorias: sku, nombre, impuesto, precio). Números en formato colombiano o inglés: `2.500` = 2500, `2,5` = 2.5.

## Terceros (Fase 3)
Leer: `parties:read`. Modificar: `parties:manage`.
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/customers?search=&includeInactive=&page=&size=` | Busca por nombre o documento; *Consumidor final* primero |
| GET | `/customers/{id}` | |
| POST | `/customers` · PUT `/customers/{id}` | Datos del tercero + `priceListId`, `creditLimit`. 409 documento ya registrado como cliente |
| POST | `/customers/{id}/activate` · `/deactivate` | El tercero del sistema no se modifica (422) |
| GET/POST/PUT | `/suppliers` … | Igual, sin lista ni cupo |

Datos del tercero: `{personType: NATURAL|LEGAL, documentType: CC|CE|NIT|PASSPORT|TI|PEP, documentNumber, verificationDigit (solo NIT), firstNames, lastNames | businessName, email, phone, address, cityCode}`. Persona jurídica = NIT. El DV se valida con el algoritmo de la DIAN (422 indicando el DV correcto).

## Inventario (Fase 4)
Leer: `inventory:read`. Ajustes, saldos iniciales, conteos y mínimos: `inventory:adjust`. Traslados: `inventory:transfer`.
Cantidades siempre en unidad base del producto en las respuestas.
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/inventory/stock?branchId=&search=&categoryId=&page=&size=&sort=name,asc` | Existencias de una sucursal: `{productId, sku, name, unitCode, quantity, minStock, maxStock, status: LOW\|OK\|OVER, averageCost, stockValue}` |
| GET | `/inventory/balance?branchId=&productId=` | Saldo de un producto en una sucursal |
| GET | `/inventory/alerts?branchId=` | Productos en o por debajo del mínimo (todas las sucursales si no se indica) |
| PUT | `/inventory/stock-levels` | `{branchId, productId, minStock, maxStock}` (null = sin límite; 422 si máximo < mínimo) |
| GET | `/inventory/kardex?productId=&branchId=&from=&to=&page=&size=` | Movimientos, el más reciente primero. Fechas `AAAA-MM-DD` en la zona horaria del negocio |
| GET | `/inventory/documents?type=&branchId=&page=&size=` · `/inventory/documents/{id}` | Documentos con sus líneas |
| GET | `/inventory/consistency` | `{consistent, mismatches[]}`: compara cada saldo con la suma de sus movimientos |
| POST | `/inventory/initial-balances` | `{branchId, notes, lines}`. 409 si el producto ya tiene movimientos en la sucursal |
| POST | `/inventory/adjustments` | `{branchId, reason, notes, lines}`; cada línea con `direction: IN\|OUT`; costo solo en entradas |
| POST | `/inventory/transfers` | `{fromBranchId, toBranchId, notes, lines}` |
| POST | `/inventory/counts` | `{branchId, reason, notes, lines}`; `quantity` = lo contado (puede ser 0) |

Línea: `{productId, unitId (opcional, base por defecto), quantity, direction, unitCost (por unidad indicada)}`.
Los `POST` responden 201 con el documento y aceptan el encabezado `Idempotency-Key`. 422 *Existencias insuficientes* si una salida deja el saldo negativo; 409 si otra operación simultánea obliga a reintentar.

## Caja (Fase 5)
Operar: `cash:operate`. Historial: `cash:read` (sin él, cada usuario ve solo sus sesiones). Esperado, diferencia y desglose del efectivo: `cash:audit` (cierre ciego).
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/payment-methods` | Medios de pago activos `{id, code: CASH\|CARD\|TRANSFER, name, affectsCash, requiresReference}` (`sales:create`, `sales:read`, `cash:read` o `cash:operate`) |
| GET | `/cash/registers` | Cajas activas de las sucursales del usuario (todas con `branches:manage`) con `busy`/`busyBy` |
| GET | `/cash/sessions/current` | Sesión abierta del usuario; **204** si no tiene (`cash:operate` o `sales:create`) |
| POST | `/cash/sessions` | `{cashRegisterId, openingAmount, notes}` → 201. 409 si la caja o el usuario ya tienen una abierta; 403 sucursal no asignada |
| POST | `/cash/sessions/{id}/movements` | `{type: INCOME\|EXPENSE\|WITHDRAWAL, amount > 0, reason}` → 201. Solo en la sesión propia y abierta. `Idempotency-Key` opcional |
| POST | `/cash/sessions/{id}/close` | `{countedAmount, notes}` → informe de cierre. Quien abrió o quien tenga `cash:audit`. 409 si ya está cerrada |
| GET | `/cash/sessions?cashRegisterId=&branchId=&status=&userId=&from=&to=&page=&size=` | Historial (`cash:read`) |
| GET | `/cash/sessions/{id}` · `/movements` · `/report` | Sesión, movimientos de efectivo e informe X/Z `{salesCount, salesTotal, voidedCount, voidedTotal, netSales, byMethod[], voidsHereCount, cash{opening, sales, voidRefunds, incomes, expenses, withdrawals, expected, counted, difference}, auditView}` |

## Ventas (Fase 5)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/sales` | `sales:create` | Registra la venta (cuerpo abajo). **`Idempotency-Key` obligatoria** (8–100 `A-Z a-z 0-9 _ -`). 201 con la venta |
| POST | `/sales/{id}/void` | `sales:void` | `{reason}` → venta anulada. 409 si ya lo estaba; 422 si hay que devolver efectivo y no hay caja abierta |
| GET | `/sales?from=&to=&branchId=&status=&cashSessionId=&search=&page=&size=` | `sales:read` | `search`: número (`POS-12` o `12`) o nombre/documento del cliente |
| GET | `/sales/{id}` | `sales:read` | Venta con ítems, pagos, impuestos y encabezado del tiquete |
| GET | `/sales/config` | `sales:create` | `{pricesIncludeTax, maxDiscountPercent, allowNegativeStock, currency, receiptFooter, businessName, finalConsumerId}` |
| GET | `/sales/price?productId=&unitId=&customerId=` | `sales:create` | Precio vigente para el cliente |

Cuerpo de venta:
```json
{ "customerId": null,
  "items": [{ "productId": "<id>", "unitId": null, "quantity": 2, "discountPercent": null, "unitPrice": 2000 }],
  "payments": [{ "paymentMethodId": "<CARD>", "amount": 20000, "reference": "APR-123" },
               { "paymentMethodId": "<CASH>", "amount": 10000 }],
  "expectedTotal": 25000, "notes": null }
```
- `customerId` nulo = consumidor final. `unitId` nulo = unidad base. `unitPrice` y `expectedTotal` (opcionales) son lo que mostró la pantalla: si difieren de lo que calcula el servidor → **409** con `changes[{line, sku, name, expectedPrice, currentPrice}]`, `expectedTotal` y `currentTotal`.
- Pagos: `amount` es lo entregado. La suma debe cubrir el total; tarjeta y transferencia no pueden superarlo (el cambio solo sale del efectivo).
- 422: sin caja abierta, existencias insuficientes (indica producto y disponible), cantidades con decimales en unidades enteras, pagos inválidos. 403: descuento por encima del límite sin `sales:discount`.

## Reportes (Fase 6)
Permiso `reports:read` (salvo `my-day`: `sales:read`). Filtros: `from`, `to` (`AAAA-MM-DD`, zona horaria del negocio; sin fechas = hoy; máximo 367 días; 422 si `to` < `from`), `branchId`, `sellerId`. Solo cuentan las ventas registradas; las anuladas se informan en el resumen.
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/reports/dashboard?branchId=` | `{date, today: Summary, yesterdayTotal, byHour[24], last7Days[7], topProducts[≤5], byPaymentMethod[]}` |
| GET | `/reports/my-day` | Ventas propias de hoy `{salesCount, total, averageTicket, byPaymentMethod[]}` |
| GET | `/reports/sales/summary` | `{salesCount, grossTotal, discountTotal, subtotal, taxTotal, total, averageTicket, cost, profit, marginPercent, voidedCount, voidedTotal}` |
| GET | `/reports/sales/by-day` · `/by-branch` · `/by-seller` | `[{key, label, salesCount, subtotal, taxTotal, total, averageTicket, cost, profit, marginPercent}]` |
| GET | `/reports/sales/by-payment-method` | `[{paymentMethodId, code, name, count, amount}]` |
| GET | `/reports/products?orderBy=total\|quantity&limit=50` | `[{productId, sku, name, categoryName, unitCode, quantity, subtotal, total, cost, profit, marginPercent}]` |
| GET | `/reports/categories` | Igual por categoría |
| GET | `/reports/taxes` | `[{taxType, taxRate, salesCount, taxableBase, taxAmount}]` |
| GET | `/reports/inventory/valuation?branchId=` | `{rows[{branch, product, quantity, averageCost, value}], totalValue, productCount}` (existencias actuales) |

**CSV**: agrega `.csv` a cualquiera de las rutas anteriores (salvo `dashboard`, `my-day` y `summary`), más `/reports/sales.csv` (ventas una a una, con anuladas). `text/csv; charset=UTF-8` con BOM, separador `;`, coma decimal, fechas `AAAA-MM-DD HH:mm` en la hora del negocio y `Content-Disposition: attachment` (expuesto por CORS). `sales.csv` responde 422 si el rango tiene más de 100.000 ventas. Los textos que empiezan por `= + - @` se escriben con `'` delante (protección contra inyección de fórmulas).
Cada descarga de CSV queda en la auditoría del negocio (`REPORT_EXPORTED`, con el nombre del archivo y las filas).

## Auditoría (Fase 7-2)
Permiso `audit:read` (Dueño, Administrador y Contador). Solo lectura: los registros no se pueden modificar ni borrar (trigger). Filtros: `from`, `to` (`AAAA-MM-DD`, zona del negocio; **sin fechas = últimos 7 días**; máximo 367 días; 422 si `to` < `from`), `actorId`, `entity`, `action`, `q` (id exacto del registro o texto dentro de los datos guardados).
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/audit?page=&size=` (50 por defecto, máx. 100) | Página de `{id, createdAt, actorId, actorName, action, entity, entityId, label, ip, hasData}`, más reciente primero. `label`: nombre, número, código o correo del registro |
| GET | `/audit/{id}` | Lo mismo con `before` y `after` (objetos JSON tal como se guardaron, o `null`); 404 si no existe |
| GET | `/audit/actions` | `[{entity, action, count}]` presentes en el negocio (para los filtros) |
| GET | `/audit/actors` | `[{id, name}]` autores presentes (para los filtros) |
| GET | `/audit/export.csv` | CSV (mismo formato que los reportes; acciones y módulos en español). 422 si supera 50.000 filas. La exportación queda auditada (`AUDIT_EXPORTED`) |

Acciones que se registran además de los cambios de cada módulo: `BUSINESS_CREATED` (al crear el negocio), `SESSION_STARTED` (entrar al negocio), `SESSION_ENDED` (cerrar sesión), `REPORT_EXPORTED`, `AUDIT_EXPORTED`.

## Eventos de seguridad (plataforma, Fase 7-2)
Solo administradores de plataforma (`platform_admin`; token con `padm`). Tabla `platform.security_events`, solo inserción.
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/platform/security-events?from=&to=&event=&userId=&q=&page=&size=` | Página de `{id, occurredAt, event, userId, email, userName, tenantId, tenantName, ip, userAgent, details}`. `from`/`to` en ISO-8601 (`2026-10-06T00:00:00Z`; sin fechas = últimos 7 días). `q`: correo o IP (contiene). 422 con un `event` desconocido |

Eventos: `REGISTERED`, `LOGIN_SUCCEEDED`, `LOGIN_FAILED` (`details.reason`: `UNKNOWN_EMAIL`, `BAD_PASSWORD`, `LOCKED`, `INACTIVE`), `ACCOUNT_LOCKED` (`details.until`), `LOGOUT`, `TENANT_ENTERED`, `TENANT_ACCESS_DENIED`, `REFRESH_TOKEN_REUSED`, `RATE_LIMITED` (`details.path`; uno por IP y minuto), `TENANT_CREATED`, `TENANT_PROVISIONING_FAILED`.

## Consola de plataforma (Fase 7-3)
Administradores de plataforma: `platform_admin = true` en la base; `PLATFORM_ADMIN_EMAILS` lo aplica al arrancar a las cuentas que ya existen con esos correos **y con el correo confirmado** (y se lo quita a las demás si la lista no está vacía). Su token trae `padm` y `/auth/me` devuelve `user.platformAdmin = true`.
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/platform/tenants?q=&status=&page=&size=` | Página de `{id, slug, legalName, tradeName, businessType, status, ownerId, ownerEmail, ownerName, activeMembers, createdAt, suspendedAt, suspensionReason, closedByOwner}`. `q`: nombre, razón social, identificador o correo del dueño |
| POST | `/platform/tenants/{id}/suspend` `{reason}` | `TenantSummary`. Motivo obligatorio (máx. 300; lo ven los miembros). 409 si no está activo |
| POST | `/platform/tenants/{id}/reactivate` | `TenantSummary`. 409 si no está suspendido |

Suspender revoca los refresh tokens de todos los miembros del negocio; los access tokens vigentes reciben 403 ("El negocio no está disponible.", `code: TENANT_UNAVAILABLE`). Queda en los eventos (`TENANT_SUSPENDED`, `TENANT_REACTIVATED`) y en la auditoría del negocio (`BUSINESS_SUSPENDED`, `BUSINESS_REACTIVATED`, sin autor).

## Eliminar (cerrar) un negocio — dueño (Fase 7-3)
`POST /tenants/{id}/close` `{confirmation, password, reason?}` → 204. Solo el dueño (403 para los demás). `confirmation` es el nombre comercial (sin distinguir mayúsculas). Nombre o contraseña incorrectos → **422** (no 401); cada contraseña errada cuenta para el bloqueo de la cuenta (5 → 423 por 15 min). El negocio queda `SUSPENDED` con `closedByOwner = true`; los datos se conservan y solo el administrador de plataforma lo reactiva. Evento `TENANT_CLOSED`, auditoría `BUSINESS_CLOSED`.

`GET /tenants` incluye ahora `suspensionReason` y `closedByOwner` en cada negocio.

## Límites de solicitudes (Fase 7-3)
Por usuario (o por IP sin sesión), ventana de un minuto: **300** solicitudes a `/api/**` (`RATE_LIMIT_API`) y **20** operaciones pesadas (`RATE_LIMIT_HEAVY`: descargas `.csv`, `POST /products/import`, `POST /tenants/{id}/close`). Al superarlo: **429** con `Retry-After` (segundos). Login (10/min) y registro (5/min) por IP siguen igual.

## Correos (Fase 7-4)
Los correos salen **después de confirmar la transacción**, en segundo plano (2 hilos) y con 3 intentos (0, 2 y 8 s; solo errores temporales: 429, 5xx, red). Si fallan, la operación ya quedó hecha y el error queda en el log (correo enmascarado: `a***@dominio.com`).

| Tipo (`kind`) | Cuándo | A quién |
|---|---|---|
| `verificacion` | Registro y "Reenviar correo" | La cuenta nueva (enlace `<APP_PUBLIC_URL>/verificar-correo?token=`, 24 h) |
| `restablecer-clave` | "¿Olvidaste tu contraseña?" | La cuenta (enlace `/restablecer-clave?token=`, 1 h) |
| `clave-cambiada` | Contraseña restablecida | La cuenta |
| `invitacion` | Invitar y reenviar invitación | El invitado (enlace `/invitacion/<token>`, 7 días) |
| `negocio-suspendido` · `negocio-reactivado` · `negocio-cerrado` | Suspender/reactivar (plataforma) o cerrar (dueño) | El dueño |

Envío: **Resend** (API HTTP) si hay `RESEND_API_KEY`; si no, **SMTP** si hay `SPRING_MAIL_HOST` (Mailpit en desarrollo); si no, **el log** del backend. Los enlaces de un solo uso se guardan como hash SHA-256 en `platform.user_tokens`; pedir uno nuevo invalida los anteriores del mismo tipo. Eventos de seguridad: `EMAIL_VERIFIED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET`. Límites por IP: `verify-email` y `password-reset/confirm` como el login (10/min), `password-reset/request` como el registro (5/min).

## Cambios de la Fase 7-6b
- `POST /cash/sessions/{id}/movements`: un egreso o retiro mayor que el efectivo que debería haber en la caja → **422** (el mensaje no revela el esperado: cierre ciego).
- `GET /cash/sessions/{id}/report`: en una caja cerrada, `voidedCount`, `voidedTotal`, `netSales` y `byMethod` quedan como al cierre; las ventas anuladas después se informan en `voidedAfterCloseCount` y `voidedAfterCloseTotal`.
- `GET /reports/products.csv`: trae todos los productos vendidos del periodo (antes se cortaba en 1.000); el parámetro `limit` ya no aplica al CSV.
