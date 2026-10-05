# Fase UX-1 — Tema, tokens, iconos y shell

## Qué cambió

| Antes | Después |
|---|---|
| Menú lateral `bg-slate-900` fijo de 240 px, sin iconos; en móvil, una franja con scroll horizontal | Menú claro con iconos y secciones, contraíble a solo iconos (se recuerda); en móvil, cajón con botón hamburguesa |
| Sin barra superior; "Cambiar negocio" y "Salir" como texto al fondo del menú | Barra superior con migas de pan, negocio actual, selector de tema y menú de usuario (cambiar negocio, salir) |
| Colores escritos a mano en cada pantalla (`slate-*`, `white`, `blue-700`…), solo modo claro | Tokens de diseño en `styles.css` + preset de PrimeNG; modo claro, oscuro o según el sistema |
| Fuente del sistema, sin iconos | Inter (autohospedada) y PrimeIcons |
| Sin permiso → volvía al inicio sin explicar; URL desconocida → inicio | Páginas "Sin permiso (403)" y "No encontramos esta página (404)" con "Ir al inicio" y "Volver" |
| Título de pestaña fijo "POS Híbrido" | Título por pantalla: "Productos · POS Híbrido", "Ajuste · POS Híbrido"… |
| Sin indicador de carga global | Barra fina superior mientras hay peticiones en curso (tras 200 ms) |
| Favicon de Angular | Favicon propio (SVG) y `theme-color` |

Las 24 pantallas existentes se migraron a tokens (sin cambiar su estructura; eso llega en UX-2 a UX-5).

## Cómo probar

```powershell
cd frontend
npm ci
npm run check:colors   # sin colores literales
npm run build          # producción
npm run test:ci
cd ..
docker compose up --build
# En otra terminal, con la app levantada (npm install y playwright install solo la primera vez):
cd e2e; npm install; npx playwright install chromium; npx playwright test; cd ..
```

1. Entra con un usuario demo (`node tools/demo/seed-demo.mjs`, clave `DemoPos2026`).
2. **Tema:** botón de sol/luna/monitor en la barra superior → Claro, Oscuro, Según el sistema. Recarga la página: no debe
   haber destello blanco en modo oscuro. Con "Según el sistema", cambia el tema del sistema operativo y la app lo sigue.
3. **Menú:** "Contraer menú" al pie del menú lateral → solo iconos, con el nombre al pasar el mouse o con el foco
   (tooltip). Recarga: sigue contraído. Con la ventana a menos de 768 px aparece el botón ☰ y el menú se abre como cajón;
   al elegir una opción se cierra.
4. **Teclado:** desde la barra de direcciones, `Tab` muestra "Saltar al contenido"; todo el menú, las migas, el tema y el
   menú de usuario se recorren con `Tab` y se abren con `Enter`; los menús emergentes se recorren con las flechas y se
   cierran con `Esc`. El foco siempre es visible.
5. **Permisos:** entra como cajero: el menú muestra solo sus opciones. Escribe a mano `/app/roles` → página 403.
   Escribe `/app/no-existe` → 404 dentro del menú; `/no-existe` → 404 a pantalla completa.
6. **Migas y títulos:** Existencias → Kardex de un producto: "Inicio › Inventario › Existencias › Kardex" y pestaña
   "Kardex · POS Híbrido".
7. **Carga:** con la red lenta (DevTools → Network → Slow 4G) aparece la barra fina superior al cambiar de pantalla.
8. **Recorrido de contraste:** en modo oscuro, abre cada pantalla (inicio/tablero, POS, caja, historial, ventas,
   reportes, productos, editor e importación, ajustes de catálogo, existencias, movimientos, kardex, documentos de
   inventario, clientes, proveedores, sucursales, cajas, usuarios, roles, ajustes, login, registro, negocios, invitación)
   y sus diálogos: ningún texto debe quedar ilegible.
9. **Tiquete:** cobra una venta en modo oscuro e imprime: el tiquete sale en negro sobre blanco, 58/80 mm, como antes.

## Notas

- Los colores se cambian solo en `frontend/src/styles.css` y `frontend/src/app/core/theme/app-preset.ts` (ver
  decisiones 96–99).
- `npm run check:colors` también corre en CI.
