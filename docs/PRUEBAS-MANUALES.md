# Lista de pruebas manuales

_POS Híbrido · revisión antes de abrir a clientes (QA 7-6d)_

Esta lista cubre lo que las pruebas automáticas no pueden ver: el lector de códigos y la impresora reales, el correo que llega a la bandeja, la tablet en el mostrador, y lo que siente una persona usando el sistema.

Hazla en el servidor de pruebas (o en tu PC con docker compose), nunca con datos de clientes. Marca cada casilla cuando el resultado sea el esperado; si no, anótalo en Hallazgos (al final) y toma una captura.

Las referencias entre corchetes (por ejemplo [UI-6]) son los hallazgos del QA que esa prueba confirma (docs/QA.md).

**Fecha:** ____ · **Versión / commit:** ____ · **Probado por:** ____ · **Equipo y navegador:** ____

## Antes de empezar

- Dos navegadores (por ejemplo Chrome y Edge) o una ventana de incógnito, para tener dos usuarios a la vez.
- Un correo real tuyo para registrarte y otro para invitar (o Mailpit en http://localhost:8025 si pruebas en tu PC).
- Lector de códigos de barras USB, impresora térmica (58 u 80 mm) si la vas a ofrecer, y una tablet o celular.
- Cinco productos de prueba: uno con código de barras, uno con presentación (caja x12), uno por peso (KG), uno sin control de inventario y uno con precio en una lista especial.

## 1. Cuenta, correo y sesión

_Cualquier persona_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 1 | Registrarse con un correo real. | Llega "Confirma tu correo" (revisar también Spam). Sin confirmar, no deja crear el negocio y muestra el aviso para reenviar. |
| ☐ | 2 | Abrir el enlace del correo. | Dice que el correo quedó confirmado y ya deja crear el negocio. Abrir el mismo enlace otra vez: "El enlace no es válido o ya venció". |
| ☐ | 3 | Escribir mal la contraseña 5 veces. | Al quinto intento la cuenta queda bloqueada 15 minutos, con un mensaje claro. |
| ☐ | 4 | "¿Olvidaste tu contraseña?" y cambiarla desde el correo. | Llega el enlace; con la clave nueva se entra, la sesión abierta en el otro navegador se cierra al renovarse (a más tardar en 15 minutos) y llega el aviso "Tu contraseña cambió". |
| ☐ | 5 | Copiar la dirección de una pantalla interna (por ejemplo Reportes), cerrar sesión y pegarla. | Pide iniciar sesión (y elegir negocio) y luego abre esa misma pantalla. [UI-11] |
| ☐ | 6 | Dejar la app abierta más de 15 minutos sin usarla y luego navegar. | Sigue funcionando sin pedir la contraseña (la sesión se renueva sola). |
| ☐ | 7 | Con el Wi-Fi apagado, intentar guardar algo. | Aviso de sin conexión; al volver la conexión se puede reintentar sin haber perdido la sesión. [SEG-7] |

## 2. Negocio, usuarios y ajustes

_Dueño_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 8 | Crear el negocio y seguir "Primeros pasos". | Cada paso lleva a la pantalla correcta y se marca al completarlo. |
| ☐ | 9 | En Ajustes: nombre, NIT, pie del tiquete, descuento máximo e "IVA incluido". | Se guardan y se reflejan en el tiquete y en el POS. |
| ☐ | 10 | Crear una segunda sucursal y una segunda caja. | Aparecen en Sucursales y Cajas; la caja nueva aparece al abrir caja en el POS. |
| ☐ | 11 | Invitar a un usuario como Cajero. | Llega el correo de invitación con el nombre del negocio; el enlace en pantalla también sirve (para WhatsApp). |
| ☐ | 12 | "Reenviar" la invitación de inmediato y después de un minuto. | De inmediato: pide esperar. Después: llega un enlace nuevo y el viejo deja de servir. |
| ☐ | 13 | Aceptar la invitación con la cuenta invitada. | Entra al negocio con el rol asignado; en Usuarios aparece activo. |
| ☐ | 14 | Desactivar a ese usuario mientras tiene la app abierta. | Pierde el acceso a ese negocio a más tardar en 15 minutos (al renovarse su sesión) y no puede volver a entrar. |
| ☐ | 15 | Crear un rol propio (por ejemplo Supervisor) con pocos permisos y asignarlo. | El usuario solo ve las opciones de esos permisos. |

## 3. Productos

_Dueño o Bodeguero_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 16 | Crear un producto con código de barras leyéndolo con el lector. | El código queda en el campo; el Enter del lector NO guarda el producto a medio llenar. [UI-1] |
| ☐ | 17 | Agregar una presentación "Caja x12" con su propio código y precio. | En el POS, leer el código de la caja agrega 1 CJ con el precio de la caja. |
| ☐ | 18 | Escribir precios como "2.500" y "$ 12.000". | Se entienden como dos mil quinientos y doce mil; al salir del campo se ven con puntos de miles. [DIN-1] |
| ☐ | 19 | Cambiar algo y salir sin guardar (otro menú o cerrar la pestaña). | Pregunta "Cambios sin guardar"; "Seguir aquí" conserva lo escrito. [UI-7] |
| ☐ | 20 | Quitar "Controla inventario" a un producto con existencias. | No lo deja: explica que primero hay que dejar las existencias en cero. [INV-3] |
| ☐ | 21 | Importar la plantilla CSV con una fila mal, corregirla en Excel y volver a elegir el mismo archivo. | La primera vez muestra la fila con error; la segunda lee el archivo corregido e importa. [UI-12] |
| ☐ | 22 | Abrir el CSV de la plantilla en Excel. | Tildes y ñ se ven bien; columnas separadas. |

## 4. Inventario

_Bodeguero_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 23 | Saldo inicial de 3 productos con su costo. | Existencias muestra las cantidades y el valor; el kardex muestra "Saldo inicial". |
| ☐ | 24 | Ajuste: leer el mismo código 3 veces seguidas, rápido. | Una sola línea con cantidad 3 (no tres líneas ni códigos pegados). [UI-6] |
| ☐ | 25 | Traslado de 5 unidades a la otra sucursal. | Baja en el origen y sube en el destino al instante; dos movimientos en el kardex. |
| ☐ | 26 | Conteo físico: agregar un producto, vender 2 unidades en el POS (otro navegador) y registrar el conteo con lo que había. | La existencia final descuenta las 2 vendidas (el conteo no las "devuelve"). [INV-2] |
| ☐ | 27 | Conteo: cambiar de sucursal después de agregar productos. | La columna "En sistema" se actualiza con la nueva sucursal. |
| ☐ | 28 | Poner mínimo a un producto por debajo de su existencia. | Aparece en alertas del inicio y como "Bajo mínimo" en Existencias. |
| ☐ | 29 | Intentar una salida mayor que la existencia. | No deja: "Existencias insuficientes" con el disponible. |

## 5. Caja y punto de venta

_Cajero (en la tablet o el PC del mostrador)_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 30 | Abrir caja con base "50.000". | Queda abierta con $ 50.000 (no $ 50). [DIN-1] |
| ☐ | 31 | Vender leyendo códigos; "2*" + código; buscar con F2; cobrar con F4. | Cantidades y totales correctos; F4 abre el cobro con el total. |
| ☐ | 32 | Cobrar en efectivo con $ 20.000 una venta de $ 13.500. | Cambio $ 6.500, sin centavos; el tiquete dice lo mismo. [DIN-2] |
| ☐ | 33 | Pago mixto: parte tarjeta (con referencia) y parte efectivo. | Tarjeta no puede pasar del total; el cambio solo sale del efectivo. |
| ☐ | 34 | Con el cobro abierto, leer un código con el lector. | NO registra la venta ni cambia el monto: avisa y deja el monto como estaba. [UI-2] |
| ☐ | 35 | Hacer doble clic rápido en "Registrar venta". | Una sola venta (un solo consecutivo POS-n). [UI-3] |
| ☐ | 36 | Imprimir el tiquete en 58 y en 80 mm. | Se lee completo, sin cortes; nombre del negocio, NIT y pie correctos. |
| ☐ | 37 | Con productos en el carrito, ir a otra pantalla o cerrar la pestaña. | Pregunta antes de salir; "Seguir aquí" conserva el carrito. [UI-7] |
| ☐ | 38 | Registrar un egreso mayor que el efectivo de la caja. | No lo deja, sin decir cuánto hay (cierre ciego). [DIN-4] |
| ☐ | 39 | Cerrar caja contando $ 1.000 de menos. | El cajero NO ve el esperado al contar; el informe Z muestra el faltante a quien tiene permiso de auditar caja. |
| ☐ | 40 | Abrir el POS con el servidor apagado. | Muestra "Reintentar", no "Abrir caja". [UI-5] |

## 6. Ventas, anulaciones y reportes

_Dueño o Contador; las anulaciones (42 y 43), solo el Dueño: el Contador no tiene el permiso de anular._

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 41 | Buscar una venta por número (POS-3 o 3) y reimprimirla. | Aparece y el tiquete es igual al original. |
| ☐ | 42 | Anular una venta en efectivo con la caja abierta. | Pide motivo; el efectivo se devuelve en esa caja y la existencia vuelve. |
| ☐ | 43 | Con tu propia caja abierta, anular una venta de una caja ya cerrada. | El efectivo se devuelve en tu caja abierta; el informe de la caja cerrada no cambia y la anulación aparece aparte. Sin caja abierta, pide abrirla. [DIN-3] |
| ☐ | 44 | Tablero e informes de "Hoy" pasadas las 7 p. m. | Cuentan las ventas del día de Colombia (no las pasa a mañana). [DIN-6] |
| ☐ | 45 | Descargar CSV de ventas y de productos y abrirlos en Excel. | Tildes bien, números con coma decimal, todas las filas. [DIN-5] |
| ☐ | 46 | Auditoría: buscar el cambio de precio y la anulación hechos antes. | Aparecen con quién, cuándo y el antes/después. |

## 7. Lo que ve cada rol

_Un usuario por rol (la prueba automática ya lo cubre; aquí, una mirada rápida)_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 47 | Cajero. | Vende y opera su caja; no ve Reportes, Auditoría, Historial de caja ni Usuarios. |
| ☐ | 48 | Vendedor. | Abre su propia caja y vende; consulta clientes pero no los crea. |
| ☐ | 49 | Bodeguero. | Productos e inventario; no ve Vender ni Mi caja. |
| ☐ | 50 | Contador. | Ventas, historial de caja, reportes y auditoría; no vende ni administra usuarios. |
| ☐ | 51 | Escribir a mano la dirección de una pantalla sin permiso. | Muestra "No tienes permiso para ver esto". |

## 8. Varios negocios y plataforma

_Dueño con dos negocios · Administrador de plataforma_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 52 | Con dos negocios: abrir A en una pestaña y cambiar a B en otra; volver a la primera y guardar algo. | Avisa que cambiaste de negocio y NO guarda en el negocio equivocado. [SEG-2] |
| ☐ | 53 | Buscar en B un producto o venta que solo existe en A. | No aparece. |
| ☐ | 54 | Plataforma: suspender un negocio con un motivo. | Le llega el correo al dueño; sus usuarios pierden el acceso con un mensaje claro. |
| ☐ | 55 | Reactivarlo. | Llega el aviso; los usuarios vuelven a entrar y sus datos están intactos. |
| ☐ | 56 | Eventos de seguridad. | Se ven los bloqueos y los inicios de sesión fallidos de las pruebas anteriores. |

## 9. Dispositivos y presentación

_Cualquier persona_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 57 | POS en tablet horizontal. | Todo cabe sin desplazarse; botones fáciles de tocar; el teclado en pantalla no tapa el cobro. |
| ☐ | 58 | App en el celular (menú, productos, reportes). | Se usa sin zoom; el menú se abre con el botón. |
| ☐ | 59 | Modo oscuro. | Todo legible: tablas, diálogos, tiquete en pantalla y gráficos. |
| ☐ | 60 | Manual de uso (/manual) desde la ayuda "?" de una pantalla. | Abre en otra pestaña en la sección correcta; el buscador encuentra palabras sin tildes. |

## 10. Antes de abrir (en el servidor)

_Tú, al desplegar_

| OK | # | Prueba | Resultado esperado |
|---|---|---|---|
| ☐ | 61 | Prueba de carga contra el servidor de pruebas (loadtest/README.md). | APROBADA con 50 tiendas. |
| ☐ | 62 | Respaldo diario. | Hay un respaldo de hoy en Google Drive y la restauración de prueba semanal terminó bien. |
| ☐ | 63 | Correos reales con Resend. | Llegan a Gmail y Outlook sin caer en Spam (dominio verificado). |
| ☐ | 64 | JWT_SECRET y contraseñas de producción nuevas. | Ninguna es la de desarrollo ni se compartió por chat. |
| ☐ | 65 | https y dominio. | El candado aparece; http redirige a https. |

## Hallazgos

Anota aquí lo que no salió como se esperaba (número de prueba, qué pasó, captura) y compártelo para corregirlo antes de abrir.
