# Fase UX-3 — Tablero y reportes con Chart.js

## Qué cambió

| Antes | Después |
|---|---|
| Gráficas propias en HTML (`app-bar-chart`), solo barras, sin tooltips ni modo oscuro | `app-chart` sobre Chart.js: barras, líneas y dona; tooltips en pesos; ejes abreviados ("$ 1,3 M"); colores de los tokens (claro y oscuro); tabla de datos para lectores de pantalla y resumen en el `aria-label` |
| Tablero solo de hoy, 4 tarjetas planas | Selector de periodo (Hoy, Ayer, 7 días, 30 días, Mes actual, Rango) y de sucursal; los indicadores comparan con el periodo anterior y muestran una mini tendencia |
| — | Gráfica principal: ventas por hora (hoy, con vista "Últimos 7 días") o ventas por día con el periodo anterior punteado |
| Barras de productos y medios de pago | Productos más vendidos en barras horizontales y medios de pago en dona con valor y porcentaje |
| Alertas de existencias como texto | Tarjeta accionable con "Ver existencias" y "Hacer un ajuste" (botón "Ajustar" pedido en ESTADO) |
| "Cargando…" | Esqueletos de carga, error con "Reintentar" y estado vacío ("Aún no hay ventas hoy · Ir a vender") |
| Reportes con filtros de fecha sueltos y tablas a mano | Barra de filtros fija arriba (periodo, sucursal, vendedor), totales destacados, "Exportar a Excel (CSV)" siempre visible para la pestaña actual, tablas con `app-data-table` |
| Periodo y filtros se perdían al recargar | Todo va en la URL: `?periodo=7d&sucursal=…&vendedor=…&vista=products` (se puede compartir el enlace) |
| "Mis ventas de hoy" en una tarjeta de texto | "Mi día" con el mismo lenguaje visual: indicadores grandes y dona de medios de pago |

Chart.js se carga solo donde hay gráficas: el tablero y "Mi día" van en un bloque `@defer` dentro del inicio, y
Reportes es una ruta diferida. El paquete inicial no crece.

## Cómo probar

```powershell
cd frontend
npm install            # agrega chart.js al lockfile: commitéalo junto con el parche
npm run check:colors; npm run build; npm run test:ci
cd ..
docker compose up --build
# En otra terminal:
cd e2e; npx playwright test; cd ..
```

1. **Inicio (dueño)**:
   - Con datos demo, el tablero muestra 4 indicadores con "vs. ayer" y una mini tendencia.
   - Cambia a "7 días": la URL queda `?periodo=7d`, la gráfica principal pasa a ventas por día con el periodo anterior punteado, y los indicadores dicen "vs. periodo anterior".
   - Recarga la página: el periodo se mantiene.
2. **Rango**: elige "Rango" y pon fechas invertidas: aparece el aviso y no consulta. Con fechas válidas, consulta.
3. **Modo oscuro**: cambia el tema con el tablero abierto. Las gráficas se vuelven a pintar con los colores oscuros: ejes, cuadrícula y tooltips legibles.
4. **Lector de pantalla** (o DevTools → Accessibility): cada gráfica es una imagen con un resumen ("Total $ …, mayor valor: …") y tiene una tabla oculta con los datos.
5. **Sin ventas hoy** (negocio nuevo): sale "Aún no hay ventas hoy · Ir a vender".
6. **Error**: detén el backend y recarga: sale "No pudimos cargar el tablero" con "Reintentar".
7. **Reportes**:
   - Desde el tablero, "Ver todos" de productos abre Reportes → Productos con el mismo periodo.
   - Cambia de pestaña, vendedor y orden: todo queda en la URL.
   - "Exportar a Excel (CSV)" descarga el reporte de la pestaña actual.
   - En Inventario no se muestra el periodo (es a hoy).
8. **Cajero**: el inicio muestra "Mi día" (vendido, ventas, ticket promedio, dona de medios de pago) y las alertas de existencias si tiene `inventory:read`.
9. **Tablet horizontal** (1024×768): indicadores en 2 columnas, gráfica principal y dona lado a lado.
10. **Paquete inicial**: compara "Initial total" del build con el de `main`; no debe crecer. El chunk de Chart.js aparece como diferido.

## Limitaciones (ver decisiones 122–131)

- **Ventas por hora** solo para "Hoy": el endpoint del tablero no recibe fecha. La comparación por hora contra ayer
  queda como propuesta de backend (`GET /reports/sales/by-hour?from&to&branchId`).
- Los indicadores de otros periodos se calculan con `sales/summary` del periodo y del periodo anterior del mismo largo
  (2 consultas), y la tendencia con `sales/by-day`.
