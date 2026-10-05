# Fase UX-2 — Componentes compartidos

## Qué cambió

| Antes | Después |
|---|---|
| `app-data-table` en HTML plano: dos botones de página, "Cargando…", celdas solo texto | Tabla nueva (`shared/table/`): orden por columna, búsqueda con debounce, tamaño de página, esqueleto de carga, estado vacío con acción, celdas por tipo (dinero a la derecha, fechas, tiempo relativo, insignias de estado), plantillas de celda y vista de tarjetas en móvil |
| Cada pantalla con su tabla a mano (kardex, caja, ajustes de catálogo, detalle de documentos, errores de importación) | Todas usan `app-data-table` (modo paginado o lista en memoria) |
| Cada pantalla con su diálogo de formulario; doble clic podía enviar dos veces; errores solo en toast | `app-form-dialog`: spinner y sin doble envío, errores del servidor junto a cada campo, confirmación al cerrar con cambios, Enter guarda y Esc cierra |
| Estados con `p-tag` y colores distintos por pantalla ("Activo", "Inactiva", "Anulada"…) | `app-status-badge` con un mapa único (`shared/status.ts`) |
| Confirmaciones con "Sí"/"No" | `ConfirmService`: verbo claro ("Desactivar sucursal", "Anular venta", "Descartar cambios"), "Cancelar" y foco en cancelar |
| Errores con nombres técnicos ("cityCode: no existe") | Etiquetas en español ("Municipio: no existe") y títulos humanos ("Sin conexión", "Algo salió mal") |
| Títulos sueltos (`<h1>`) | `app-page-header` con título, descripción y acciones |

Nuevos también: `app-empty-state`, `app-stat-card` (KPI con variación y mini tendencia, se usa en UX-3), `app-field-error`.

### Pantallas migradas

- **Tabla paginada:** Productos, Existencias, Movimientos de inventario, Kardex, Clientes, Proveedores, Sucursales, Cajas, Usuarios (miembros e invitaciones), Ventas e Historial de caja.
- **Lista en memoria:** Ajustes de catálogo (4 pestañas), movimientos de "Mi caja", líneas del detalle de un documento de inventario y errores de la importación de productos.
- **Diálogo de formulario genérico:** Sucursales, Cajas, Clientes/Proveedores, Ajustes de catálogo y Anular venta.
- **Quedan con su propia tabla, a propósito:** las líneas editables (documento de inventario, carrito del POS) y las tablas de Reportes. Reportes se migra en UX-3 y el POS en UX-4.

## Cómo probar

```powershell
cd frontend
npm ci
npm run check:colors
npm run build
npm run test:ci
cd ..
docker compose up --build
```

1. **Productos**:
   - Escribe en el buscador: la lista se filtra sola al dejar de escribir; Enter busca de inmediato.
   - Haz clic en "Precio": ascendente, otra vez descendente y otra vez el orden por nombre. El encabezado se anuncia como ordenado.
   - Cambia a 50 filas por página.
   - Busca algo que no exista: debe salir "Sin resultados" con "Limpiar búsqueda".
2. **Esqueleto**: con la red lenta (DevTools → Slow 4G), al entrar a una lista se ven filas grises en lugar de "Cargando…".
3. **Estado vacío**: en un negocio nuevo, Clientes muestra "Aún no hay clientes · Crear cliente" y el botón abre el diálogo.
4. **Sucursales → Nueva sucursal**:
   - Guarda vacío: el formulario marca los campos y pone el foco en el primero con error.
   - Escribe un código con espacios: aparece el mensaje de formato.
   - Usa un código que ya existe: el error sale dentro del diálogo, no como toast.
   - Haz doble clic en "Guardar": se crea una sola vez.
5. **Cambios sin guardar**: abre "Editar", cambia el nombre y pulsa Esc (o la X, o Cancelar): pregunta "Descartar cambios". Sin cambios, cierra directo.
6. **Enter**: en el diálogo de cajas, escribe el nombre y pulsa Enter para guardar.
7. **Móvil** (menos de 768 px): las listas se ven como tarjetas con las acciones abajo.
8. **Estados**: Ventas muestra "Registrada"/"Anulada" e Historial de caja muestra "Abierta", "Cerrada", "Cuadrada" o "Faltante $ …" con los mismos colores en claro y oscuro. Sin el permiso `cash:audit`, el arqueo sale "—" (cierre ciego).
9. **Confirmaciones**: desactiva un producto. El botón dice "Desactivar producto", es rojo y el foco queda en "Cancelar".
10. **E2E**: `cd e2e; npx playwright test`. Los selectores no cambiaron.

## Notas

- La tabla solo ofrece orden en las columnas que el backend permite (`sortField`): productos (SKU, nombre, precio), existencias (SKU, nombre), sucursales y cajas (código, nombre), usuarios (nombre) e invitaciones (correo, vencimiento). Ver la decisión 112.
- Se agregó el parámetro `size` a las llamadas de ventas, historial de caja, documentos y kardex del frontend. El backend ya lo aceptaba.
