# Fase UX-5 — Primeros pasos, ayudas y pulido

## Qué cambió

| Antes | Después |
|---|---|
| Inicio: "Hola, nombre" y la lista de permisos en código (`sales:create`) | Saludo según la hora ("Buenas tardes, Ana"), accesos rápidos según los permisos y "Lo que puedes hacer en este negocio" en palabras ("Puedes vender, abrir, mover y cerrar caja y consultar las ventas"). Los códigos quedan plegados solo para quien administra roles |
| Un dueño nuevo no sabía por dónde empezar | **Primeros pasos** con avance real: sucursal, categorías, productos (o CSV), existencias iniciales, equipo (opcional), abrir caja y primera venta. Cada paso tiene su botón; se puede ocultar y volver a mostrar |
| Sin ayuda dentro de la app | Botón **Ayuda (?)** en la barra superior de cada pantalla con 3–4 consejos y las palabras clave explicadas |
| Términos como "kardex" o "cierre ciego" sin explicar | Botón (i) junto al término que abre su definición (funciona con toque y teclado): base de efectivo, cierre ciego, arqueo, kardex, existencia mínima, medios de pago, costo promedio, lista de precios |
| — | **Recorrido guiado** de 5 pasos la primera vez que alguien ve el tablero y la pantalla de venta; se repite desde la ayuda, el menú de usuario o la ayuda del POS |
| Algunas listas vacías sin acción | Todas las listas vacías dicen qué hacer y tienen su botón cuando hay permiso (Ir a vender, Ir a Mi caja, Registrar saldo inicial, Ir a productos, Invitar usuario) |
| Roles: había que inventar un código (`SUPERVISOR`) y se veían los códigos de permiso | El código se arma solo con el nombre (se puede cambiar en "Opciones avanzadas"); los permisos se muestran solo con su descripción |
| Ajustes: zona horaria `America/Bogota` | "Colombia (Bogotá)", y ayudas bajo el descuento máximo y el pie del recibo |
| Mi caja: "Cargando…" | Esqueleto de carga |

## Cómo probar

```powershell
cd frontend
npm run check:colors; npm run build; npm run test:ci
cd ..
docker compose up --build
# En otra terminal:
cd e2e; npx playwright test; cd ..
```

1. **Negocio nuevo** (regístrate y crea un negocio): el inicio muestra "Primeros pasos · 1 de 7" con "Revisa tu
   sucursal" hecho y "Crea las categorías" resaltado. Sigue los botones: al volver al inicio cada paso aparece hecho.
   Con caja abierta y una venta, el título cambia a "¡Tu negocio está listo para vender!" (invitar al equipo es opcional).
2. **Ocultar**: "Ocultar lista" la esconde (recarga: sigue oculta); "Mostrar los primeros pasos" la trae de vuelta.
3. **Recorridos**: con un usuario que no los ha visto, el tablero muestra el recorrido (5 pasos: accesos, periodo,
   indicadores, gráfica, alertas). Esc o "Saltar" lo cierran y no vuelve a salir. Ayuda (?) → "Ver el recorrido guiado
   de esta pantalla", o menú de usuario → "Ver recorrido guiado", lo repiten. En el POS sale la primera vez con la caja
   abierta (código, productos, carrito, Cobrar, ayuda) y se repite desde "Atajos de teclado" → "Ver recorrido guiado".
   Durante el recorrido del POS, Esc no cancela la venta y F4 no abre el cobro.
4. **Ayuda por pantalla**: en Productos, Existencias, Mi caja… el botón (?) abre consejos y palabras clave. En una ruta
   sin ayuda (página 404) no aparece.
5. **Términos**: Mi caja → Cerrar caja (cierre ciego, arqueo); Historial de caja; Kardex; Existencias → niveles
   (existencia mínima); Reportes → Medios de pago; producto con costo calculado (costo promedio); Clientes → lista de
   precios. Tocar (i) abre la explicación; Esc la cierra.
6. **Cajero**: el inicio muestra Vender, Mi caja, Existencias, Ventas y Clientes, y "Puedes vender, abrir, mover y cerrar
   caja…"; no ve primeros pasos ni códigos de permiso.
7. **Listas vacías**: en un negocio nuevo, Ventas, Historial de caja, Movimientos, Existencias y Usuarios muestran su
   botón de acción.
8. **Auditoría**: ver [`UX-5-AUDITORIA.md`](UX-5-AUDITORIA.md) (Lighthouse en login, inicio, tablero y POS).

## Atajos de teclado

| Dónde | Tecla | Acción |
|---|---|---|
| Toda la app | `Tab` / `Shift+Tab` | Recorrer enlaces, botones y campos (el foco siempre se ve) |
| Toda la app | Primer `Tab` | "Saltar al contenido" |
| Menús y diálogos | Flechas, `Enter`, `Esc` | Moverse, elegir, cerrar |
| Listas | `Enter` en la búsqueda | Buscar sin esperar |
| Formularios | `Enter` / `Esc` | Guardar / cerrar (pide confirmar si hay cambios) |
| POS | `F2` | Buscar producto por nombre |
| POS | `F4` | Cobrar |
| POS | `Enter` | Agregar el código escrito · Registrar la venta · Nueva venta |
| POS | `Esc` | Cerrar la ventana abierta o cancelar la venta |
| POS | `3*código` | Agregar 3 unidades |
| POS | `?` (campo de código vacío) | Ver los atajos |
| Recorrido guiado | `Esc` / `Tab` | Cerrar / moverse entre Saltar, Atrás y Siguiente |

## Decisiones

Ver decisiones 144–154 en [`DECISIONES.md`](DECISIONES.md).
