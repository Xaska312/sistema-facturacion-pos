# QA — Fase 7-6

Revisión completa del sistema antes de abrir a clientes: plan de pruebas, matriz de riesgos, registro de hallazgos y
lo que queda como riesgo conocido. Se trabaja en cuatro partes (un parche y una validación por parte):

| Parte | Contenido | Estado |
|---|---|---|
| **7-6a** | Este documento, rol Vendedor, seguridad y sesión | ✅ PR #20 |
| **7-6b** | Dinero y punto de venta: pesos sin centavos, montos con punto de miles, informe de caja, cobro | 🧪 entregada |
| **7-6c** | Inventario y operación: conteo físico, arranque con muchos negocios, pool, CSV grandes, consultas | pendiente |
| **7-6d** | Pruebas nuevas (e2e por rol, prueba de carga), lista de pruebas manuales e informe final | pendiente |

## 1. Alcance y método

- **Revisión de código** módulo por módulo, buscando fallos que se puedan reproducir (no opiniones de estilo), en
  cuatro frentes: seguridad y aislamiento entre negocios; dinero (ventas, impuestos, descuentos, pagos, caja,
  reportes); inventario, concurrencia y operación; y flujos de la interfaz.
- **Cada hallazgo** tiene un id, severidad, un escenario concreto y su corrección, y se cierra con una prueba
  automática que falla antes del arreglo y pasa después (cuando se puede automatizar).
- **Pruebas automáticas existentes** (red de seguridad): 21 clases de integración del backend contra PostgreSQL real (más pruebas unitarias)
  (Testcontainers), ~265 pruebas del frontend, e2e de venta con Playwright en cada PR, lint.
- **Pruebas que se agregan** en 7-6d: e2e por rol (cajero, vendedor, bodeguero, contador), anulación, traslado,
  invitación; prueba de carga con k6 (muchas cajas vendiendo a la vez).
- **Pruebas manuales** (equipo real, 7-6d): impresora térmica de 58 y 80 mm, lector de código de barras, tablet
  horizontal, celular, modo oscuro, dos pestañas abiertas, red inestable.

### Severidad

| Severidad | Significa |
|---|---|
| **Crítica** | Pérdida o mezcla de datos entre negocios, acceso sin autorización a datos de otro negocio, caída total |
| **Alta** | Dinero o existencias mal registrados sin aviso, escalada de permisos, caída de todos los negocios por uno |
| **Media** | Error que el usuario puede notar y corregir, abuso limitado, mala experiencia en casos frecuentes |
| **Baja** | Casos raros, información menor expuesta, mejoras de robustez |

## 2. Matriz de riesgos

Probabilidad × impacto de lo que más le puede doler a un negocio que usa el POS. "Control" es lo que ya lo evita.

| # | Riesgo | Prob. | Impacto | Control actual | Prueba |
|---|---|---|---|---|---|
| R1 | Un negocio ve o modifica datos de otro | Baja | Crítico | Schema por negocio, `tid` del JWT, `search_path` por conexión con `RESET` | `TenantIsolationIT`, `ModuleIsolationIT`, aislamiento en cada IT |
| R2 | Venta con total distinto al cobrado | Media | Alto | El servidor recalcula y rechaza (409) si difiere | `SalesIT`, `sale-math.spec` · **7-6b: centavos** |
| R3 | La caja no cuadra por errores del sistema | Media | Alto | Esperado calculado de movimientos inmutables, cierre ciego | `CashIT` · **7-6b: punto de miles, centavos** |
| R4 | Existencias equivocadas (ventas, anulaciones, conteos) | Media | Alto | Libro de movimientos inmutable, bloqueos por saldo | `InventoryIT` · **7-6c: conteo con ventas** |
| R5 | Venta duplicada por doble clic o red lenta | Media | Medio | Clave de idempotencia por carrito | `SalesIT` · **7-6b: cerrar el cobro mientras guarda** |
| R6 | Acceso indebido (permisos, robo de sesión) | Media | Alto | Permisos en cada endpoint, anti-escalada, refresh rotado | `PrivilegeEscalationIT`, `AuthFlowIT` · **7-6a** |
| R7 | Caída de todos los negocios (arranque, memoria, pool) | Baja | Crítico | Límites de memoria, apagado ordenado | **7-6c** |
| R8 | Pérdida de datos (servidor, error humano) | Baja | Crítico | Respaldo diario cifrado, prueba de restauración semanal | `restore.sh --test` |
| R9 | Correos que no llegan o se usan para spam | Media | Medio | Reintentos, enlaces de un solo uso | `EmailIT` · **7-6a: tope de invitaciones** |
| R10 | Reportes que no coinciden con la caja | Baja | Medio | Mismas reglas (solo COMPLETED, zona del negocio) | `ReportsIT` · **7-6b: informe Z tras anular** |

## 3. Registro de hallazgos

Ids: **SEG** seguridad y sesión · **DIN** dinero y punto de venta · **INV** inventario, concurrencia y operación ·
**UI** interfaz. Estado: ✅ corregido (parte) · ⏳ pendiente (parte prevista) · 🟰 aceptado (riesgo documentado).

### Seguridad y sesión (7-6a)

| Id | Sev. | Hallazgo | Estado |
|---|---|---|---|
| SEG-1 | Alta | Aceptar una invitación daba el correo por confirmado, pero el token también lo recibe quien invita: alguien podía registrarse con un correo ajeno, invitarse y "confirmarlo" (y heredar el permiso de administrador de plataforma al reiniciar) | ✅ 7-6a |
| SEG-2 | Alta | Cambiar de negocio en otra pestaña cambia la cookie de refresh: la pestaña vieja, al renovar, reintentaba la petición con el token del otro negocio (escribía en el negocio equivocado) | ✅ 7-6a |
| SEG-3 | Media | El límite por IP de login, registro y restablecer se evitaba codificando la URL (`/auth/%6Cogin`) | ✅ 7-6a |
| SEG-4 | Media | Intentos de login en paralelo evitaban el bloqueo (bloqueo optimista: solo uno contaba) | ✅ 7-6a |
| SEG-5 | Media | Dos pestañas renovando a la vez: la segunda se tomaba como robo y cerraba todas las sesiones del usuario | ✅ 7-6a |
| SEG-6 | Media | Invitar/reenviar sin espera ni tope: servía para enviar spam y agotar la cuota de correos | ✅ 7-6a |
| SEG-7 | Media | Un fallo de red al renovar la sesión la cerraba (se perdía el carrito en Wi-Fi inestable) | ✅ 7-6a |
| SEG-8 | Baja | Invitar de nuevo a un miembro desactivado lo reactivaba, aunque quien invita no pudiera gestionarlo | ✅ 7-6a |
| SEG-9 | Baja | "Eliminar negocio" permitía probar contraseñas sin bloqueo | ✅ 7-6a |
| SEG-10 | Baja | Se puede saber si un correo tiene cuenta (registro 409; 423 solo para cuentas que existen) | 🟰 decisión 200 |
| SEG-11 | Baja | El cajero ve los movimientos de venta de su sesión y podría calcular el esperado del cierre ciego | 🟰 decisión 200 |
| SEG-12 | Baja | `TRUNCATE` se salta los triggers de inmutabilidad | ⏳ 7-6c |
| ROL-1 | Media | El rol Vendedor tenía `sales:create` pero no podía abrir caja: no podía vender | ✅ 7-6a (decisión del usuario: darle caja) |

### Dinero y punto de venta (7-6b)

| Id | Sev. | Hallazgo | Estado |
|---|---|---|---|
| DIN-1 | Alta | Los campos de montos son `type="number"`: "250.000" se lee como 250 (cierre de caja, costos, precios, base) | ✅ 7-6b |
| DIN-2 | Media | El sistema guarda centavos (descuentos %, precios sin IVA) pero muestra pesos: cambio entregado de más, "Falta $ 0", faltantes de $1 en el arqueo | ✅ 7-6b |
| DIN-3 | Media | El informe de una caja cerrada cambia si después se anula una de sus ventas | ✅ 7-6b |
| DIN-4 | Baja | Egresos y retiros pueden dejar el efectivo esperado en negativo (error de digitación) | ✅ 7-6b |
| DIN-5 | Baja | El CSV de productos vendidos se corta en 1.000 filas sin avisar | ✅ 7-6b |
| DIN-6 | Baja | "Hoy" en reportes usa la zona horaria del equipo, no la del negocio | ✅ 7-6b |
| DIN-7 | Baja | Cantidades decimales del carrito se redondean a 2 decimales (el servidor admite 4) o acumulan error (0,1+0,2) | ✅ 7-6b |
| UI-1 | Alta | El Enter del lector en el código de barras guarda el producto a medio crear | ✅ 7-6b |
| UI-2 | Media | Escanear con el cobro abierto reemplaza el monto recibido y registra la venta | ✅ 7-6b |
| UI-3 | Media | Cerrar el cobro mientras guarda permite cambiar el carrito y duplicar la venta | ✅ 7-6b |
| UI-4 | Media | Una respuesta tardía del lector le quita el foco al cobro | ✅ 7-6b |
| UI-5 | Media | Un error de red al abrir el POS muestra "Abrir caja" y deja al cajero atascado | ✅ 7-6b |

### Inventario, concurrencia y operación (7-6c)

| Id | Sev. | Hallazgo | Estado |
|---|---|---|---|
| INV-1 | Alta | Si la migración de un negocio falla al arrancar, no arranca ninguno | ⏳ 7-6c |
| INV-2 | Alta | El conteo físico suma las ventas hechas durante el conteo (inventa existencias) | ⏳ 7-6c |
| INV-3 | Media | Se puede apagar "controla inventario" con existencias y el saldo queda desfasado | ⏳ 7-6c |
| INV-4 | Media | Flyway recrea vacío el schema de un negocio que falta (oculta una pérdida de datos) | ⏳ 7-6c |
| INV-5 | Media | Consultas N+1 en productos y existencias (cientos de consultas por venta en el POS) | ⏳ 7-6c |
| INV-6 | Media | Pool agotado responde 500 y no hay tiempos máximos de bloqueo ni de consulta | ⏳ 7-6c |
| INV-7 | Media | Los CSV grandes se arman en memoria (riesgo de quedarse sin memoria y reiniciar) | ⏳ 7-6c |
| INV-8 | Baja | Cantidades en unidad base fuera de rango terminan en 500 o en un 409 confuso | ⏳ 7-6c |
| INV-9 | Baja | El costo de la venta puede leerse antes de un ajuste concurrente | 🟰 7-6c (documentar) |
| INV-10 | Baja | La idempotencia de documentos de inventario no compara tipo ni usuario | ⏳ 7-6c |
| INV-11 | Baja | `/inventory/consistency` recorre todo el kardex con solo `inventory:read` | ⏳ 7-6c |
| INV-12 | Media | Arranque más lento con muchos negocios (migración uno por uno) | ⏳ 7-6c (medir) |
| UI-6 | Media | Lecturas rápidas del lector se mezclan en el documento de inventario | ⏳ 7-6c |
| UI-7 | Media | No se avisa de cambios sin guardar al salir (documento, producto, carrito) | ⏳ 7-6c |
| UI-8 | Baja | Reintentar un documento editado devuelve el anterior sin avisar | ⏳ 7-6c |
| UI-9 | Baja | Rangos de más de un año en la URL de reportes no caen al periodo predeterminado | ✅ 7-6b |
| UI-10 | Baja | Listas que pueden mostrar resultados viejos (respuestas fuera de orden) | ⏳ 7-6c |
| UI-11 | Baja | Se pierde la página pedida al pasar por el login | ⏳ 7-6c |
| UI-12 | Baja | Volver a elegir el mismo CSV corregido no lo vuelve a leer | ⏳ 7-6c |
| UI-13 | Baja | Algunos permisos de pantalla se leen una sola vez | ⏳ 7-6c |

## 4. Revisado y sin hallazgos

Resumen de lo que los cuatro frentes revisaron de punta a punta y encontraron correcto:

- **Aislamiento**: negocio solo desde el `tid` del JWT; `search_path` con `SET`/`RESET` por conexión; nombres de
  schema validados antes de cualquier SQL; sin hilos en segundo plano que toquen datos de negocio.
- **SQL dinámico**: parámetros en reportes y auditoría, `ORDER BY` con lista blanca, `LIKE` con escape.
- **Permisos**: `@PreAuthorize` en todos los endpoints de negocio, `/platform/**` exige administrador, reglas
  anti-escalada en roles, miembros e invitaciones.
- **Tokens y cookies**: HS256 con secreto ≥ 32 bytes, refresh HttpOnly + Secure + SameSite=Strict con ruta acotada,
  enlaces de un solo uso como hash SHA-256.
- **Ventas**: el servidor recalcula precio, impuesto y descuento; idempotencia correcta con peticiones simultáneas;
  consecutivo POS-n sin huecos ni duplicados; orden de bloqueos sin interbloqueos; descuento máximo exigido en el
  servidor.
- **Caja**: una sesión por caja y por usuario; venta y cierre de la misma caja bien serializados; anulación con
  devolución de efectivo correcta.
- **Inventario**: promedio ponderado sin división por cero; traslados atómicos; dos cajeros por la última unidad
  (el segundo recibe 422); paginación con tope.
- **Frontend**: sin `innerHTML` ni `bypassSecurityTrust`; token solo en memoria; sin fugas de suscripciones; reportes
  descartan respuestas viejas; atajos del POS no chocan entre sí.
- **Respaldos**: `pg_dump` verificado, restauración de prueba semanal y restauración en producción con vuelta atrás.
