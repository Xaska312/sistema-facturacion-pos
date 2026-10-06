# Auditoría final de UX (Fase UX-5)

Este informe tiene dos partes: lo que se revisó en el código (hecho) y la medición con Lighthouse (la corre quien
prueba, porque necesita la app levantada en un navegador).

## 1. Revisión en el código

### Contraste de los tokens (WCAG AA)

Calculado con la fórmula de WCAG 2.1 sobre los valores de `frontend/src/styles.css`. Mínimo para texto: 4,5:1; para
bordes de campos y elementos gráficos: 3:1.

| Par (texto / fondo) | Claro | Oscuro |
|---|---|---|
| `text` sobre `surface` | 16,77 | 14,82 |
| `text-muted` sobre `surface` | 6,71 | 7,62 |
| `text-muted` sobre `surface-alt` | 5,95 | 6,74 |
| `text-muted` sobre `surface-ground` | 6,24 | 8,31 |
| `brand` sobre `surface` (enlaces) | 5,47 | 9,32 |
| `brand-contrast` sobre `brand` (botón principal, primer acceso del inicio, paso siguiente) | 5,47 | 7,77 |
| `brand-contrast` sobre `brand-hover` | 7,58 | 9,78 |
| `brand-soft-text` sobre `brand-soft` (paso siguiente, menú activo) | 6,73 | 7,52 |
| `success` sobre `surface` | 5,02 | 9,96 |
| `success-soft-text` sobre `success-soft` (cambio en el cobro, caja abierta) | 8,30 | 7,52 |
| `warning` sobre `surface` | 5,02 | 10,39 |
| `warning-soft-text` sobre `warning-soft` (falta existencia, sin conexión) | 8,15 | 7,28 |
| `danger` sobre `surface` | 6,47 | 6,27 |
| `danger-soft-text` sobre `danger-soft` (falta en el cobro) | 8,20 | 6,93 |
| `info-soft-text` sobre `info-soft` | 8,49 | 7,29 |
| `surface` sobre `text` (barra "Deshacer" del carrito) | 16,77 | 14,82 |
| `field-border` sobre `surface` (borde de campos, 3:1) | 3,24 | 3,39 |

Todos cumplen. `npm run check:colors` garantiza que ninguna pantalla use colores fuera de estos tokens. Las gráficas
tienen su propia validación (decisión 123).

### Accesibilidad

- [x] Foco visible en todo (`:focus-visible` global con `--focus-ring`); "Saltar al contenido" en el shell.
- [x] Botones de solo icono con `aria-label`: menú, tema, usuario, ayuda (?), términos (i), − / + / quitar del carrito,
  estrella de favoritos, quitar pago.
- [x] Diálogos de PrimeNG con foco atrapado y Esc; recorrido guiado con `role="dialog"`, `aria-modal`, foco en
  "Siguiente", Tab atrapado, Esc para cerrar y el foco vuelve a donde estaba.
- [x] Primeros pasos: lista ordenada, barra de avance con `role="progressbar"` y texto ("2 de 7 pasos"); cada paso dice
  "(hecho)" o "(pendiente)" a los lectores de pantalla.
- [x] Términos con botón (no tooltip al pasar el mouse): funcionan con toque y teclado.
- [x] Campos con ayuda enlazada por `aria-describedby` (ajustes, base de efectivo, descuento de la línea, código del rol).
- [x] Gráficas con `role="img"`, resumen y tabla oculta para lectores (UX-3).
- [x] `prefers-reduced-motion`: animaciones y transiciones casi nulas; el recorrido se desplaza sin animación.
- [x] Títulos de pestaña por pantalla (UX-1) y landmarks: `main`, `nav` (menú, migas, accesos rápidos), `aside` del carrito.

### Tamaños táctiles y responsive

- [x] POS: todos los botones ≥ 44 px (UX-4). Recorrido, primeros pasos y ayuda: botones ≥ 44 px.
- [x] Inicio: accesos rápidos en 2 columnas (móvil), 3 (tablet) y 6 (escritorio); primeros pasos en 1 o 2 columnas.
- [x] Panel de ayuda: ancho `min(24rem, 100vw)`.

### Microinteracciones

- [x] Transiciones de 100–200 ms (colores, bordes, escala al tocar, posición del recorrido); ninguna mayor.
- [x] Confirmación visual al guardar: toast de éxito en formularios, ajustes, niveles, roles, caja.

### Textos técnicos

- [x] El inicio ya no muestra códigos de permiso (solo plegados para quien administra roles).
- [x] Roles: sin códigos de rol ni de permiso a la vista; el código interno se arma solo.
- [x] Zona horaria con nombre de país.
- [x] Errores del servidor con nombres de campo en español (UX-2, `FIELD_LABELS`).
- Quedan a propósito: SKU y códigos de barras (son datos del negocio), el identificador del negocio al crearlo (lo elige
  el usuario) y el enlace de invitación.

### Build

- Presupuesto del paquete inicial: el aviso pasó de 500 kB a 750 kB (decisión 155); el aviso de 500 kB ya salía antes de
  UX-1 (~683 kB). Con eso, `ng build` de producción queda sin advertencias. El error sigue en 1 MB.

## 2. Lighthouse (por completar al probar)

Con la app levantada (`docker compose up --build`), en Chrome: DevTools → Lighthouse → Modo "Navegación", categorías
"Accesibilidad" y "Prácticas recomendadas", dispositivo "Computadora" (y "Móvil" para el POS). Para que "Prácticas
recomendadas" no penalice el servidor de desarrollo, usar el build de producción:

```powershell
docker compose up -d postgres-db backend   # solo base de datos y backend
docker compose stop frontend               # libera el puerto 4200 si estaba arriba
cd frontend
npx ng serve --configuration production    # http://localhost:4200 (el proxy apunta a localhost:8080)
```

| Pantalla | Usuario | Accesibilidad (meta ≥ 90) | Prácticas recomendadas (meta ≥ 90) | Notas |
|---|---|---|---|---|
| `/login` | — | | | |
| `/app` (inicio con primeros pasos) | dueño de un negocio nuevo | | | |
| `/app` (tablero con datos) | dueño demo | | | |
| `/pos` (caja abierta) | cajero demo | | | |

Repetir con el tema oscuro (botón de tema → Oscuro) en inicio y POS. Si algún puntaje queda por debajo de 90, anotar
el hallazgo aquí y se corrige antes de cerrar la fase.

### Prueba manual

| Dispositivo | Qué revisar | Resultado |
|---|---|---|
| Tablet horizontal 1024×768 (o DevTools) | POS completo, recorrido del POS, inicio y tablero | |
| Móvil 360 px | Inicio, primeros pasos, ayuda (?), una lista y su formulario | |
| Solo teclado | Inicio → primeros pasos → productos → POS → cobro | |
