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
