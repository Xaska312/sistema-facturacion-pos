# API (v1)

Base: `/api/v1`. Errores en `application/problem+json` (RFC 9457). **Dinero en pesos enteros** (Fase 7-6b): el total de cada línea de venta se redondea al peso; pagos, base de apertura, conteo y movimientos de caja con centavos → 400. Swagger UI en `/swagger-ui.html` con `OPENAPI_ENABLED=true`.

## Autenticación (plataforma)
| Método | Ruta | Token | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Crea la cuenta. `{email, password, fullName, phone?, acceptTerms}` → 201 (`acceptTerms` debe ser `true`: acepta los Términos y la Política de datos; si no, 400). Guarda la prueba (versiones, fecha, IP) y envía el correo "Confirma tu correo" |
| POST | `/auth/login` | — | `{email, password}` → token de plataforma + cookie `pos_refresh` + `tenants[]`. 401 credenciales, 423 bloqueado |
| POST | `/auth/select-tenant` | cualquiera | `{tenantId}` → token de negocio + cookie. 403 sin membresía/negocio inactivo |
| POST | `/auth/refresh` | cookie | Rota la cookie y devuelve nuevo access token. 401 si expiró o fue reutilizada. Un token rotado hace menos de 30 s responde 401 sin cerrar las demás sesiones (otra pestaña); pasado ese margen se trata como robo |
| POST | `/auth/logout` | cookie | Revoca la cookie. 204 |
| GET | `/auth/me` | cualquiera | Usuario, `tenantId` y permisos del token |
| GET | `/auth/legal` | cualquiera | `{accepted, termsVersion, privacyVersion}`: si ya aceptó los textos vigentes (si no, la app muestra "Aceptar términos") |
| POST | `/auth/legal/accept` | cualquiera | Acepta las versiones vigentes y guarda la prueba → `{accepted: true, …}` |
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
| POST | `/tenants` | `{slug, legalName, tradeName, businessType}` → 201. `businessType`: `RETAIL` (Comercio) o `SERVICES` (Servicios); `RESTAURANT` y `PHARMACY` → 422 ("Pronto", solo la consola de plataforma). El negocio nace con los módulos de su tipo (Fase 12a). **403 `code: EMAIL_NOT_VERIFIED`** si el dueño no ha confirmado su correo, 409 slug repetido, 503 falló el aprovisionamiento |
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

### Tipo de negocio y módulos (Fase 12a, decisión 267)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/business-profile` | cualquier miembro | `{businessType, modules: ["CREDIT","ORDERS","QUOTES","VARIANTS","SCALE"], canEdit}`; `canEdit` solo para el dueño |
| PUT | `/business-profile` | solo el dueño (403 si no) | `{businessType, modules}` → mismo cuerpo. Tipo `RETAIL`/`SERVICES` o el que ya tiene (422 si es otro "Pronto"). No borra datos. Auditoría `BUSINESS_PROFILE_CHANGED` y evento `TENANT_PROFILE_CHANGED`. La app renueva la sesión después |

Módulos en el token: los permisos de un módulo apagado (`credit:*`, `orders:*`, `quotes:*`) no van en `perms`, y cada módulo encendido agrega `module:credit`, `module:orders`, `module:quotes`, `module:variants` o `module:scale`. Vender a fiado exige `module:credit` (422 sin él); crear escalas de tallas, modelos o tallas exige `module:variants`; cambiar la báscula (ajustes y PLU) exige `module:scale`.

### Adiciones (Fase 12b-1, decisión 268; requieren `module:modifiers`)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/modifier-groups` | `products:read` | Grupos con opciones (`id, name, priceDelta, maxQuantity, active`) y a qué `products` y `categories` se aplican |
| GET | `/modifier-groups/pos` | `products:read` | `{groups: [activos con opciones activas], products: {productId: [groupId…]}}` (por producto, los suyos y los de su categoría; obligatorios primero) |
| POST / PUT | `/modifier-groups[/{id}]` | `modifiers:manage` | `{name, minSelect, maxSelect, active, options: [{id?, name, priceDelta, maxQuantity, active}], productIds, categoryIds}`. `minSelect` > 0 = obligatorio; `maxSelect` (1–20) cuenta unidades; `priceDelta` en pesos enteros (puede ser 0 o negativo); `maxQuantity` 1–10. Las opciones sin `id` se crean y las que no vienen se borran. 409 nombre repetido. Auditoría `MODIFIER_GROUP_CREATED/UPDATED` |
| GET | `/reports/modifiers?from&to&branchId&sellerId` | `reports:read` | Adiciones más vendidas: `{groupName, optionName, units, amount}` |

En `POST /sales` cada ítem acepta `modifiers: [{optionId, quantity}]` y `note` (máx. 140). `unitPrice` sigue siendo el precio del producto sin adiciones; el servidor suma las adiciones (nunca baja de 0) y valida grupos obligatorios y topes (422). Con el módulo apagado, enviar adiciones da 422. La venta devuelve en cada ítem `note` y `modifiers: [{groupName, optionName, quantity, unitPrice}]`; `unitPrice` del ítem ya incluye las adiciones.

### Mesas y cuentas abiertas (Fase 12b-2, decisión 269; requieren `module:tables`)
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/dining/floor?branchId` | `tables:operate` | `{branchId, branches, zones: [{id, name, tables: [{id, name, seats, tab}]}], others}`: zonas y mesas activas con su cuenta abierta (`TabSummary`: `id, number, kind, label, tableId, openedAt, guests, customerName, total, items, openedByName`) y en `others` las de para llevar y domicilio. Sin `branchId`, la primera sucursal que atiende el usuario |
| GET | `/dining/zones?branchId` | `tables:operate` | Zonas con todas sus mesas (también inactivas) |
| POST / PUT | `/dining/zones[/{id}]` | `tables:manage` | `{branchId, name}` / `{name, position, active}`. Nombre único en la sucursal (409). No se desactiva con cuentas abiertas (409) |
| POST / PUT | `/dining/tables[/{id}]` | `tables:manage` | `{zoneId, name, seats?}` / `{zoneId, name, seats, position, active}`. Nombre único en la sucursal |
| POST | `/tabs` | `tables:operate` | `{kind: TABLE\|TAKEAWAY\|DELIVERY, tableId?, branchId?, guests?, customerName?, phone?, address?, notes?}` → 201 `TabView`. Mesa con cuenta abierta → 409; domicilio sin dirección → 422 |
| GET / PUT | `/tabs/{id}` | `tables:operate` | `TabView`: `{id, number, kind, status (OPEN, CHARGED, CANCELLED, MERGED), label, branchId, tableId, tableName, zoneName, guests, customerName, phone, address, notes, openedAt, openedByName, closedAt, saleId, total, items}`; cada ítem con `unitPrice` (con adiciones, al pedir), `basePrice`, `openPrice`, `note`, `modifiers`, `addedByName`, `sentAt`, `voided`, `voidReason`. PUT cambia `{guests, customerName, phone, address, notes}` |
| POST | `/tabs/{id}/items` | `tables:operate` | `{items: [{productId, unitId?, quantity, unitPrice? (solo precio libre), modifiers?, note?}]}` (máx. 50 por vez, 200 por cuenta). Adiciones validadas como en la venta |
| POST | `/tabs/{id}/items/{itemId}/void` | `tables:operate` | `{reason}`: queda tachado. Lo que ya salió a cocina (`sentAt`, Fase 12b-3) necesita `tables:void` |
| POST | `/tabs/{id}/move` · `/merge` | `tables:operate` | `{tableId}` (mesa libre de la sucursal) · `{fromTabId}` (sus productos pasan a esta; la otra queda `MERGED`) |
| POST | `/tabs/{id}/cancel` | `tables:operate` (+ `tables:void` si tiene productos) | `{reason}` |
| POST | `/tabs/{id}/charge` | `tables:operate` + `sales:create` | `Idempotency-Key` obligatoria. `{customerId?, payments, expectedTotal}` → 201 con la venta (como `POST /sales`; precio vigente, adiciones, nota y `notes` = nombre de la cuenta). Caja abierta de la misma sucursal (422). Ya cobrada → 409; repetir con la misma clave devuelve la misma venta |

Todas las acciones de cuentas, zonas y mesas quedan en la auditoría (`TAB_*`, `DINING_ZONE_*`, `DINING_TABLE_*`).

### Ajustes del negocio
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/settings` | `settings:read` | `{allowNegativeStock, pricesIncludeTax, timezone, currency, receiptFooter, maxDiscountPercent, cashCloseEmail, quoteValidityDays, quoteTerms}` |
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
`sales:create|read|void|discount|open-price`, `credit:read|collect|manage`, `reports:read`, `audit:read` (Fase 7-2: OWNER, ADMIN y ACCOUNTANT).
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
| POST | `/products/import?dryRun=true` (multipart `file`: plantilla de Excel `.xlsx` o CSV) | Reporte `{totalRows, toCreate, toUpdate, newCategories, errors[{row, message}], applied}`. Con `dryRun=false` importa solo si no hay errores. El Excel se reconoce por el contenido (zip) y se lee su primera hoja |
| GET | `/products/import/template` | Plantilla `plantilla-productos.xlsx`: hoja *Productos* (encabezados, 2 ejemplos, listas de unidad, impuesto y sí/no con los códigos activos del negocio) e *Instrucciones* (`products:manage`) |
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
| POST | `/customers` · PUT `/customers/{id}` | Datos del tercero + `priceListId`, `creditLimit` (cupo de fiado; en PUT, nulo lo conserva; asignarlo o cambiarlo exige `credit:manage`, si no 403). 409 documento ya registrado como cliente |
| POST | `/customers/{id}/activate` · `/deactivate` | El tercero del sistema no se modifica (422) |
| GET/POST/PUT | `/suppliers` … | Igual, sin lista ni cupo |

Datos del tercero: `{personType: NATURAL|LEGAL, documentType: CC|CE|NIT|PASSPORT|TI|PEP|PPT|TE|RC|NUIP|FOREIGN_ID|FOREIGN_NIT, documentNumber, verificationDigit (solo NIT), firstNames, lastNames | businessName, email, phone, address, cityCode}`. Persona jurídica = NIT o FOREIGN_NIT (NIT de otro país, sin DV); FOREIGN_NIT no sirve para persona natural (422). El DV se valida con el algoritmo de la DIAN (422 indicando el DV correcto).

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
| GET | `/inventory/consistency` | `{consistent, mismatches[]}`: compara cada saldo con la suma de sus movimientos. Pide `inventory:adjust` y comparte el cupo de consultas pesadas (429) |
| POST | `/inventory/initial-balances` | `{branchId, notes, lines}`. 409 si el producto ya tiene movimientos en la sucursal |
| POST | `/inventory/adjustments` | `{branchId, reason, notes, lines}`; cada línea con `direction: IN\|OUT`; costo solo en entradas |
| POST | `/inventory/transfers` | `{fromBranchId, toBranchId, notes, lines}` |
| POST | `/inventory/counts` | `{branchId, reason, notes, lines}`; `quantity` = lo contado (puede ser 0); `expectedQuantity` = la existencia en unidad base que se mostró al empezar a contar (opcional; sin ella, el saldo actual) |

Línea: `{productId, unitId (opcional, base por defecto), quantity, direction, unitCost (por unidad indicada), expectedQuantity (solo conteos)}`. En unidad base, máximo 9.999.999.999,9999 (422).
Los `POST` responden 201 con el documento y aceptan el encabezado `Idempotency-Key` (repetirla devuelve el mismo documento; usada en otro tipo de documento o por otro usuario, 409). 422 *Existencias insuficientes* si una salida deja el saldo negativo; 409 si otra operación simultánea obliga a reintentar.

## Caja (Fase 5)
Operar: `cash:operate`. Historial: `cash:read` (sin él, cada usuario ve solo sus sesiones). Esperado, diferencia y desglose del efectivo: `cash:audit` (cierre ciego).
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/payment-methods` | Medios de pago activos `{id, code: CASH\|CARD\|TRANSFER, name, affectsCash, requiresReference}` (`sales:create`, `sales:read`, `cash:read` o `cash:operate`) |
| GET | `/cash/registers` | Cajas activas de las sucursales del usuario (todas con `branches:manage`) con `busy`/`busyBy`, `shared` y `openSessionId` (sesión abierta de una caja compartida). `cash:operate` o `sales:create` |
| GET | `/cash/sessions/current` | Sesión donde vende el usuario: la que abrió o la compartida a la que se unió (`mine` false, `shared` true); **204** si no tiene (`cash:operate` o `sales:create`) |
| POST | `/cash/sessions/{id}/join` | Vender en una caja compartida abierta (decisión 256). 422 si la caja es personal; 409 si el usuario tiene su propia caja abierta o la sesión ya se cerró; 403 sucursal no asignada. Deja la compartida anterior |
| POST | `/cash/sessions/current/leave` | Deja la caja compartida (no la cierra) → 204 |
| POST | `/cash/sessions` | `{cashRegisterId, openingAmount, notes}` → 201. Si el usuario vendía en una caja compartida, la deja. 409 si la caja o el usuario ya tienen una abierta; 403 sucursal no asignada |
| POST | `/cash/sessions/{id}/movements` | `{type: INCOME\|EXPENSE\|WITHDRAWAL, amount > 0, reason}` → 201. En la sesión propia y abierta; en una compartida, quien se unió registra ingresos y egresos (retiros solo quien la abrió o con `cash:audit`). `Idempotency-Key` opcional |
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
| GET | `/reports/inventory/slow-movers?days=90&branchId=` (y `.csv`) | `{days, rows[{branch, product, quantity, averageCost, value, lastSaleAt}], totalValue, productCount}`: con existencia y sin ventas en `days` (7–365) días (decisión 254) |

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
| GET | `/platform/tenants?q=&status=&page=&size=` | Página de `{id, slug, legalName, tradeName, businessType, status, ownerId, ownerEmail, ownerName, activeMembers, createdAt, suspendedAt, deletedAt, deletionReason, suspensionReason, closedByOwner}`. `q`: nombre, razón social, identificador o correo del dueño |
| POST | `/platform/tenants/{id}/suspend` `{reason}` | `TenantSummary`. Motivo obligatorio (máx. 300; lo ven los miembros). 409 si no está activo |
| POST | `/platform/tenants/{id}/reactivate` | `TenantSummary`. 409 si no está suspendido |
| PUT | `/platform/tenants/{id}/business-type` `{businessType}` | `TenantSummary` (Fase 12a). Cualquier tipo, también `RESTAURANT`/`PHARMACY` para pilotos; el negocio queda con los módulos de ese tipo. 409 si está eliminado |
| POST | `/platform/tenants/{id}/delete` `{confirmation, password, reason}` | 204 (decisión 262). Eliminación definitiva de un negocio `SUSPENDED` o `FAILED` (409 si no): `confirmation` es el nombre comercial (sin distinguir mayúsculas), `password` la del administrador; error en cualquiera → 422 (`TENANT_DELETE_DENIED` si es la contraseña). Borra el schema `t_<slug>`, las membresías, las invitaciones y los refresh tokens del negocio; la ficha queda `DELETED` con `deletedAt`, `deletionReason` (también en la lista) y se conservan la suscripción y los pagos. Evento `TENANT_DELETED`. Cuenta como operación pesada en el límite de solicitudes |

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

## Cambios de la Fase 7-6c
- **503 `Retry-After: 5`** "El sistema está ocupado…" si no hay conexión libre en 10 s (`DB_CONNECTION_TIMEOUT_MS`) o una consulta supera su tiempo (reportes, auditoría y verificación de inventario: 60 s). Esperar un bloqueo más de 10 s o un interbloqueo: 409 (reintentar). Valor fuera de rango para la base: 422.
- **429** "Hay muchos reportes pesados en curso…" si ya hay 2 exportaciones grandes (`/reports/sales.csv`, `/audit/export.csv`) o verificaciones de inventario en curso en el servidor y no se libera un cupo en 10 s.
- `PUT /products/{id}` con `trackInventory: false` → **422** si el producto tiene existencias en alguna sucursal (déjalas en cero antes). La importación CSV deja el control encendido en ese caso.
- Ventas: cantidad en unidad base mayor que 9.999.999.999,9999 o igual a 0 → 422 "La cantidad de X no es válida.".
- `TRUNCATE` sobre tablas inmutables (kardex, documentos, caja, ventas, auditoría, eventos de seguridad) falla igual que `UPDATE`/`DELETE`.
- Un negocio cuya migración falló al arrancar responde 403 `TENANT_UNAVAILABLE` hasta que se corrija; los demás funcionan normal.

## Suscripciones (Fase 8b)
Cada negocio tiene una suscripción: **prueba gratis** de 14 días con los límites del plan Pro (solo el primer negocio de cada cuenta) o un **plan pagado**. Sin pasarela: el administrador de plataforma registra los pagos y genera códigos de activación.

Estados (`status`, calculados con la fecha de fin): `TRIAL` (prueba vigente), `ACTIVE` (pagado vigente), `PAST_DUE` (pagado vencido hace menos de 3 días: todo funciona, con aviso), `EXPIRED` (prueba terminada o gracia agotada). Con `EXPIRED` el negocio queda en **solo consulta**: todo `POST/PUT/DELETE` de negocio responde **403 `code: SUBSCRIPTION_EXPIRED`**, salvo cerrar la caja (`POST /cash/sessions/{id}/close`), `/auth/**` y cerrar el negocio. Las consultas y descargas CSV siguen funcionando.

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/tenants` | sesión de plataforma | Nuevo campo opcional `activationCode` (`XXXX-XXXX-XXXX`, sin distinguir mayúsculas ni guiones). Sin código: prueba gratis; si la cuenta ya tiene otro negocio, **422 `code: ACTIVATION_CODE_REQUIRED`**. Código inválido, usado, anulado o vencido: 422 |
| GET | `/subscription` | cualquier miembro | `{tenantId, tradeName, plan: {code, name, maxBranches, maxUsers, monthlyPrice, annualPrice, active}, status, trial, billingCycle: MONTHLY\|ANNUAL, startedAt, endsAt, graceEndsAt (null en prueba), daysLeft, usage: {branches, users}, paymentInstructions, payments[]}`. `payments` solo con `settings:manage` (si no, vacío). Límites `null` = sin límite |

**Límites del plan** (422 con el nombre del plan): sucursales activas (`POST /branches`, `POST /branches/{id}/activate`) y usuarios = miembros activos + invitaciones pendientes vigentes (`POST /members/invitations`, `POST /members/{id}/activate`). Planes sembrados: Básico (1 sucursal, 3 usuarios) y Pro (5 sucursales, usuarios sin límite); precios los fija el administrador.

**Consola de plataforma** (`PLATFORM_ADMIN`):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/platform/plans` | Planes |
| PUT | `/platform/plans/{code}` | `{name, maxBranches, maxUsers, monthlyPrice, annualPrice, active}` (límites `null` = sin límite) |
| GET | `/platform/subscriptions?q=&status=&page=&size=` | Suscripciones de todos los negocios, las que vencen primero arriba: `{tenantId, slug, tradeName, tenantStatus, ownerEmail, ownerName, planCode, planName, status, trial, endsAt, daysLeft}` |
| GET | `/platform/tenants/{id}/subscription` | Igual que `/subscription`, con pagos |
| POST | `/platform/tenants/{id}/subscription/payments` | `{planCode, billingCycle, periods (meses 1–36 o años 1–3), amount, method, reference?, notes?}` → 201 con la suscripción. El periodo empieza al terminar el vigente (o hoy si ya venció). Correo `suscripcion-pagada` al dueño. Los pagos no se editan ni se borran |
| PUT | `/platform/tenants/{id}/subscription/plan` | `{planCode}`: cambia el plan sin mover la fecha de fin |
| GET | `/platform/activation-codes` | Últimos 200: `{id, hint, planCode, planName, months, note, status: AVAILABLE\|USED\|EXPIRED\|REVOKED, expiresAt, createdAt, usedAt, usedTenantName}` |
| POST | `/platform/activation-codes` | `{planCode, months (1–36), validDays (1–365), note?, quantity (1–20)}` → 201 `{codes: ["ABCD-…"], details: […]}`. El código completo **solo se ve aquí** (se guarda el hash) |
| POST | `/platform/activation-codes/{id}/revoke` | Anula un código sin usar (409 si ya se usó) |

**Avisos por correo** al dueño (9 a. m. de Colombia): 7, 3 y 1 día antes del fin (`suscripcion-por-vencer`), al terminar (`suscripcion-vencida`) y al acabarse la gracia (`suscripcion-bloqueada`), una vez por fecha de fin. Variables: `SUBSCRIPTION_PAYMENT_INSTRUCTIONS` (cómo pagar), `SUBSCRIPTION_TRIAL_DAYS` (14), `SUBSCRIPTION_REMINDERS_ENABLED` (true).

## Tallas y colores (Fase 8d)
Un **modelo** (p. ej. "Tenis Runner") agrupa sus **variantes** (talla × color). Cada variante es un producto normal (SKU `PREFIJO-TALLA-COLOR`, código de barras interno `29…`, unidad UND, controla inventario): se vende, se cuenta y se traslada como cualquier producto. Nombre, categoría, impuesto, costo y **precio son del modelo** (igual para todas las tallas) y se copian a las variantes al guardarlo. Leer: `products:read`; crear y editar: `products:manage`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/size-scales` | Escalas `{id, code, name, active, sizes: [{label, equivalent}]}` en orden. Sembradas: Calzado Colombia (34–45), Calzado EU (35–46), Calzado US (5–12, con medias), Calzado niño (18–33), Ropa (letras), Ropa niño, Jean / pantalón |
| POST | `/size-scales` | `{name, sizes: [{label (≤10), equivalent?}]}` → 201 (máximo 40 tallas) |
| PUT | `/size-scales/{id}` | `{name, active?, sizes}`: reemplaza las tallas en ese orden. 422 si quita una talla que usa algún producto. `equivalent` = texto libre (p. ej. "EU 39"), lo edita cada negocio |
| GET | `/product-models?search=&categoryId=&includeInactive=&page=&size=&sort=` | `{id, skuPrefix, name, categoryName, salePrice, sizeScaleName, variants (cantidad), active}` |
| GET | `/product-models/{id}` | `{id, skuPrefix, name, description, categoryId, categoryName, taxId, taxCode, cost, salePrice, sizeScaleId, sizeScaleName, active, sizes[] (orden de la escala), colors[] (orden de creación), variants: [{productId, sku, name, size, color, barcode, baseUnitId, baseUnitCode, active}]}` |
| POST | `/product-models` | `{skuPrefix (1–20), name (≤140), description?, categoryId?, taxId, cost?, salePrice (> 0), sizeScaleId, sizes[], colors[]}` → 201. Crea talla × color (colores opcionales; sin repetir, sin distinguir mayúsculas; máximo 20 colores y 400 variantes). 409 prefijo repetido; 422 talla fuera de la escala |
| PUT | `/product-models/{id}` | `{name, description?, categoryId?, taxId, cost?, salePrice}`: se copia a todas las variantes (el costo, solo a las que el inventario aún no maneja). Prefijo y escala no cambian |
| POST | `/product-models/{id}/variants` | `{sizes[], colors[]}`: crea las combinaciones que faltan. 422 si ya existen todas, o si el modelo tiene colores y no se envían (o al revés) |
| PUT | `/product-models/{id}/variants/{productId}` | `{barcode?, active}`: cambia el código (p. ej. el del proveedor; 409 si es de otro producto) o activa/desactiva una talla |
| POST | `/product-models/{id}/activate` · `/deactivate` | El modelo y todas sus variantes |

Cambios en productos: `GET /products` acepta `includeVariants` (por defecto `true`; la lista de productos usa `false` y el POS ve las tallas). `ProductView` agrega `modelId`, `variantSize` y `variantColor`. `PUT /products/{id}` de una variante → 422 ("edítalo desde el modelo"). La importación CSV no modifica variantes (error en la fila).

Inventario: `GET /inventory/balances?branchId=&productIds=a,b,c` (`inventory:read`, máximo 500) → saldo de cada producto en la sucursal (0 si no tiene movimientos), para la cuadrícula talla × color del conteo.

## Marca del negocio (Fase 8c)
Color de una paleta cerrada y logo pequeño. Leer: cualquier miembro del negocio (encabezado, POS y tiquete). Cambiar: `settings:manage`. Auditoría: `BRANDING_UPDATED`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/branding` | `{color, logo (data URL o null), updatedAt}`. `color` ∈ turquesa (por defecto), azul, indigo, violeta, rosa, naranja, verde, grafito |
| GET | `/branding/header` | Cualquier miembro (decisión 261): `{businessName, branchName, branchAddress, branchPhone}` para el encabezado de los documentos del cliente (pedido en hoja carta); la sede es la activa más antigua |
| PUT | `/branding/color` | `{color}` → 422 si no es de la paleta |
| PUT | `/branding/logo` | `{dataUrl}` (`data:image/…;base64,…`, máximo 150 KB de imagen). El tipo se comprueba por la firma del archivo: solo PNG, JPEG o WebP (422 para SVG u otros) |
| DELETE | `/branding/logo` | Quita el logo |

El pie del tiquete sigue en `PUT /settings` (`receiptFooter`, ya existía).

## Báscula etiquetadora (Fase 8e)
Etiquetas EAN-13 que empiezan por 2: prefijo + PLU + valor (peso o precio) + dígito de control. Leer: `products:read`; configurar y asignar PLU: `products:manage`. Auditoría: `SCALE_SETTINGS_UPDATED`, `SCALE_PLU_ASSIGNED`, `SCALE_PLU_REMOVED`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/scale/settings` | `{enabled, prefix ("2" o "20"–"28"), pluDigits (3–6), kind (WEIGHT \| PRICE), decimals (peso: 0–3; precio: 0)}`. Al valor le quedan `12 − prefijo − PLU` dígitos (4 a 7) |
| PUT | `/scale/settings` | El mismo cuerpo. 422 con prefijo 29 (códigos internos) o si al valor no le quedan de 4 a 7 dígitos |
| GET | `/scale/plus` | `[{plu, productId, sku, name, unitCode}]` |
| PUT | `/scale/plus/{plu}` | `{productId}`: asigna o cambia el producto del PLU (se guarda sin ceros a la izquierda). 422 si la unidad base no es KG o LB; 409 si el producto ya tiene otro PLU o el PLU es de otro producto |
| DELETE | `/scale/plus/{plu}` | 204 |

`GET /products/lookup?code=` agrega `scaleQuantity` (el peso, en kg o lb) y `scaleAmount` (el precio de la etiqueta; la pantalla calcula la cantidad con el IVA): con una etiqueta de báscula y la lectura activa; null con un código normal. Un código de barras registrado tiene prioridad sobre el formato de báscula. PLU sin asignar → 404.

## Ajustes de la Fase 8 (8f)
- `GET /tenants/signup-terms` (cualquier cuenta con sesión) → `{activationCodeRequired, trialDays}`. Con `SUBSCRIPTION_TRIAL_WITHOUT_CODE=false` (por defecto) `POST /tenants` sin `activationCode` → 422 `ACTIVATION_CODE_REQUIRED`.

## Fiado (Fase 10a, decisión 255)
Medio de pago `CREDIT` ("Fiado", id …0704, no entra al efectivo): en `POST /sales` la parte fiada se carga a la cuenta del cliente. 422 si el cliente es el Consumidor final, no tiene cupo (`creditLimit` 0), hay dos líneas de fiado o, sin `credit:manage`, la venta pasa el cupo. Anular la venta descuenta lo fiado. Permisos: `credit:read` (ver), `credit:collect` (abonos), `credit:manage` (cupos, pasar el cupo, anular abonos).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/credit/summary` | `{totalBalance, customers, upTo30Days, from31To60Days, over60Days, overLimit}` (solo quienes deben) |
| GET | `/credit/accounts?search=&filter=DEBT\|ALL&page=&size=` | Cartera, primero los que más deben. `DEBT`: con saldo; `ALL`: también con cupo al día. `{customerId, name, documentType, formattedDocument, phone, active, creditLimit, balance, available, oldestDebtAt, upTo30Days, from31To60Days, over60Days, lastPaymentAt, lastPaymentAmount}` |
| GET | `/credit/accounts/{customerId}` | La cuenta de un cliente (saldo 0 si nunca se le fió). 404 si no es cliente |
| GET | `/credit/accounts/{customerId}/entries?page=&size=` | Estado de cuenta, lo más reciente primero: `{id, entryNo, type: SALE\|SALE_VOID\|PAYMENT\|PAYMENT_VOID, amount (con signo: + aumenta la deuda), balanceAfter, saleNumber, methodName, reference, notes, createdByName, createdAt, voided, voidReason, voidedAt}` |
| POST | `/credit/accounts/{customerId}/payments` | `Idempotency-Key` obligatoria. `{amount, paymentMethodId, reference?, notes?}` → 201 movimiento. En efectivo exige la caja abierta de quien recibe (movimiento de caja `CREDIT_PAYMENT`). 422 si es más de lo que debe o el medio es Fiado |
| POST | `/credit/payments/{entryId}/void` | `{reason}` (`credit:manage`). Si fue en efectivo, sale de la caja donde entró (o de la abierta de quien anula: `CREDIT_PAYMENT_VOID`). 409 si ya estaba anulado |

La antigüedad supone que los abonos pagan primero lo más viejo. El informe de caja agrega `cash.creditPayments` (abonos en efectivo menos anulados). Auditoría: `CREDIT_PAYMENT_RECEIVED`, `CREDIT_PAYMENT_VOIDED`, `CREDIT_LIMIT_EXCEEDED`.

## Pedidos por encargo (Fase 10b, decisión 258)
Permisos: `orders:read` (ver), `orders:create` (crear, editar, anticipos y entregar; entregar exige además `sales:create`), `orders:manage` (cancelar y anticipos sin caja abierta). Importes en pesos; las medidas en metros (máximo 100, 3 decimales).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/orders?filter=OPEN\|OVERDUE\|DELIVERED\|CANCELLED\|ALL&search=&page=&size=` | Por defecto `OPEN`, los de entrega más próxima primero. Busca por cliente, documento o número (`PED-12` o `12`). `{id, number, status, customerId, customerName, dueDate, overdue, total, deposited, balanceDue, itemCount, deliveredCount, createdAt}` |
| GET | `/orders/summary` | `{open, overdue, dueToday, dueSoon (próximos 3 días), balanceDue}` de los pedidos abiertos (fecha en la zona horaria del negocio) |
| GET | `/orders/{id}` | Pedido completo: cliente (`customerName`, `customerDocument`, `customerPhone`), `dueDate`, `overdue`, `address`, `notes`, `total`, `deliveredTotal`, `pendingTotal`, `deposited`, `depositAvailable`, `balanceDue`, `items[] {id, lineNo, productId, sku, productName, unitCode, description, width, length, quantity, unitPrice, total, delivered, saleId, saleNumber, deliveredAt}` y `payments[] {id, entryNo, type: DEPOSIT\|REFUND\|APPLIED\|APPLIED_VOID, amount (con signo), methodCode, methodName, reference, notes, saleId, saleNumber, createdByName, createdAt}` |
| POST | `/orders` | `{customerId, dueDate, address?, notes?, items: [{productId, description?, width?, length?, quantity?, unitPrice}]}` → 201. Con `width` y `length` la cantidad es el área (la unidad base del producto debe aceptar decimales); sin ellas, `quantity`. 422 con el Consumidor final, un cliente inactivo, fecha anterior a hoy, más de 100 líneas o un producto inactivo |
| PUT | `/orders/{id}` | Mismo cuerpo; solo pedidos abiertos. `items` reemplaza las líneas **pendientes** (las entregadas no cambian); el cliente no cambia (422). Un pedido atrasado se puede editar con la misma `dueDate`; una fecha nueva no puede ser anterior a hoy. 422 si el anticipo disponible queda mayor que lo pendiente. Sin líneas pendientes, el pedido queda entregado |
| POST | `/orders/{id}/payments` | `Idempotency-Key` obligatoria. `{amount, paymentMethodId, reference?, notes?}` → 201 pedido. En efectivo exige la caja abierta de quien recibe (movimiento `ORDER_PAYMENT`); sin caja, solo con `orders:manage`. 422 si pasa de lo que falta por pagar o el medio es Fiado o Anticipo |
| POST | `/orders/{id}/deliver` | `Idempotency-Key` obligatoria (la de la venta). `{itemIds, payments: [{paymentMethodId, amount, reference?}]}` → `{order, saleId}`. Registra una venta con las líneas elegidas en la caja de quien entrega; el anticipo disponible se aplica solo (medio `DEPOSIT`) y `payments` cubre el resto como en `POST /sales`. 409 si una línea ya se entregó o la clave es de una venta de otro pedido; 422 si la entrega completa el pedido y sobraría anticipo, si se envía el medio Anticipo o si el valor de las líneas cambió con los impuestos de hoy (hay que editar el pedido) |
| POST | `/orders/{id}/cancel` | `{reason, refundMethodId?, reference?}` (`orders:manage`). Cancela lo pendiente y devuelve el anticipo disponible con `refundMethodId` (obligatorio si hay anticipo; en efectivo, `ORDER_REFUND` de la caja abierta; referencia si el medio la exige). Sobre un pedido ya cancelado con anticipo disponible (se anuló la venta de una entrega) solo lo devuelve (`ORDER_DEPOSIT_REFUNDED`). 409 si está entregado o cancelado sin nada que devolver |

Anular (`POST /sales/{id}/void`) la venta de una entrega vuelve sus líneas a pendientes, devuelve lo aplicado al anticipo (`APPLIED_VOID`) y reabre el pedido; si el pedido ya estaba cancelado sigue cancelado y lo aplicado queda por devolver con `cancel`. El medio Anticipo tampoco sirve para abonar un fiado (422). El informe de caja agrega `cash.orderPayments` (anticipos en efectivo menos devoluciones). Auditoría: `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_PAYMENT_RECEIVED`, `ORDER_DELIVERED`, `ORDER_DELIVERY_VOIDED`, `ORDER_CANCELLED`, `ORDER_DEPOSIT_REFUNDED`.

## Cotizaciones (Fase 10c, decisión 260)
Permisos: `quotes:read` (ver; Propietario, Administrador, Cajero, Vendedor y Contador) y `quotes:create` (crear, editar, rechazar y convertir; todos menos el Contador). Convertir en pedido exige además `orders:create`; vender, `sales:create`. Una cotización no mueve inventario ni dinero.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/quotes/config` | `{validityDays, terms, pricesIncludeTax, maxDiscountPercent, businessName, branchAddress, branchPhone}`: los valores por defecto de Ajustes y el encabezado del PDF (sede activa más antigua) |
| GET | `/quotes?filter=OPEN\|EXPIRED\|ACCEPTED\|REJECTED\|ALL&search=&page=&size=` | `OPEN` (por defecto) = abiertas y vigentes; `EXPIRED` = abiertas con la fecha pasada (zona horaria del negocio). Las más recientes primero. Busca por nombre del cliente o del prospecto, documento, teléfono del prospecto o número (`COT-3` o `3`). `{id, number, status, expired, customerId, partyName, validUntil, total, itemCount, convertedType, convertedNumber, createdAt}` |
| GET | `/quotes/{id}` | Cotización completa: `customerId/customerName/customerDocument/customerPhone` o `prospectName/prospectPhone`, `validUntil`, `expired`, `notes`, `terms`, `total`, `convertedType: ORDER\|SALE`, `convertedId`, `convertedNumber`, `convertedAt`, `rejectedAt`, `rejectReason`, `items[] {id, lineNo, productId, sku, productName, unitCode, description, width, length, quantity, unitPrice, discountPercent, total}` |
| POST | `/quotes` | `{customerId?, prospectName?, prospectPhone?, validUntil?, notes?, terms?, items: [{productId, description?, width?, length?, quantity?, unitPrice, discountPercent?}]}` → 201. Cliente registrado (no el Consumidor final) o nombre del prospecto. Sin `validUntil`: hoy + `quoteValidityDays`; sin `terms` (nulo): las de Ajustes (`""` = sin condiciones). Líneas como en pedidos más `discountPercent` (0 a < 100); un descuento sobre `maxDiscountPercent` exige `sales:discount` (403). 422 con fecha anterior a hoy, sin líneas o un producto inactivo; 400 con más de 100 líneas |
| PUT | `/quotes/{id}` | Mismo cuerpo; solo abiertas (también vencidas: así se renuevan). Reemplaza todas las líneas; la misma `validUntil` se acepta aunque ya pasó. `validUntil` o `terms` nulos conservan lo guardado (`terms: ""` las quita). 409 si está aceptada o rechazada |
| POST | `/quotes/{id}/reject` | `{reason}` → cotización `REJECTED`. 409 si no está abierta |
| POST | `/quotes/{id}/order` | `{customerId?, dueDate, address?, notes?}` → cotización `ACCEPTED` con `convertedType: ORDER`. Crea el pedido con las mismas líneas y medidas y el precio neto de descuento (`unitPrice × (100 − d) / 100`, a 2 decimales); `notes` vacío toma las de la cotización. Un prospecto exige `customerId` (queda asignado a la cotización). 422 si está vencida; 409 si ya no está abierta |
| POST | `/quotes/{id}/sell` | `Idempotency-Key` obligatoria (la de la venta). `{customerId?, payments: [{paymentMethodId, amount, reference?}]}` → `{quote, saleId}`. Venta con los precios y descuentos cotizados en la caja abierta de quien vende (sin aviso de precio cambiado); un prospecto sin `customerId` queda a Consumidor final. Repetir la clave devuelve la misma venta; la clave de una venta de otra cotización → 409; también 409 si el total cambió con los impuestos de hoy (hay que editarla). 422 si está vencida o no hay caja abierta |

Ajustes (`PUT /settings`) agrega `quoteValidityDays` (1 a 365, por defecto 15) y `quoteTerms` (hasta 1000 caracteres); sin dato se conserva el valor. Auditoría: `QUOTE_CREATED`, `QUOTE_UPDATED`, `QUOTE_REJECTED`, `QUOTE_CONVERTED` (con `type` y el pedido o la venta).

Pedidos y cotizaciones (decisión 261): `POST /orders/{id}/deliver` y `POST /quotes/{id}/sell` ya aceptaban varios `payments`; la pantalla ahora los usa (por ejemplo, efectivo + Fiado dentro del cupo).
