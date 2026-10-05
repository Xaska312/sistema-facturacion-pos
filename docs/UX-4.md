# Fase UX-4 — POS para tablet

## Qué cambió

| Antes | Después |
|---|---|
| Una tabla de líneas con campos numéricos pequeños y un panel de totales | Dos columnas (pensadas para tablet horizontal 1024×768): a la izquierda código/lector, categorías y cuadrícula de productos; a la derecha el carrito, los totales y un botón **Cobrar** grande y fijo |
| Para agregar sin código había que buscar con F2 | Tarjetas táctiles con nombre, precio y existencia ("12 disp." / "Agotado"); pestañas **Favoritos**, **Todos** y una por categoría; la estrella marca favoritos |
| Cantidad y descuento en inputs de 24 px | Filas altas con − / cantidad / + y quitar (botones de 44 px); al tocar la línea se abre un popover con cantidad y descuento |
| Quitar una línea era definitivo | "Se quitó … · **Deshacer**" durante 6 segundos |
| Sin aviso de existencias | La línea se marca "Solo hay N en existencia" (suma todas las líneas del mismo producto, en unidades base) |
| Cobro: botones "+ Medio" pequeños | Total enorme, medios de pago como botones grandes con icono (Efectivo, Tarjeta, Transferencia), **Pago mixto** opcional, billetes sugeridos grandes, "Recibido / Falta / Cambio" muy visibles y validación en vivo (incluida la referencia obligatoria de cada medio) |
| Tiquete con "Imprimir" | Pantalla de éxito: "Venta registrada", el cambio en grande, **Imprimir tiquete**, ancho 58/80 mm, "Ver tiquete" plegado y **Nueva venta (Enter)** con el foco |
| Encabezado de texto | Encabezado compacto: estado de la caja ("Caja abierta desde 8:05 a. m." / "Caja cerrada"), caja · sucursal · usuario, conexión ("En línea" / "Sin conexión"), Caja, Ventas y ayuda de atajos (`?`) |
| Sin caja: aviso con enlace a otra pantalla | Apertura guiada en el mismo POS: la caja (si hay varias), la base de efectivo y un solo botón "Abrir caja" |

Se mantienen: el campo de código siempre enfocado, los atajos F2 (buscar), F4 (cobrar), Esc (cancelar), el `3*código`,
la clave de idempotencia del cobro (un reintento no duplica la venta), la recarga de precios ante un 409 y la impresión
del tiquete (58/80 mm, `receipt-print-root`).

**Una venta de 3 productos en efectivo en 6 toques:** 3 tarjetas → Cobrar → Registrar venta (el efectivo viene por el
total) → Nueva venta. Con lector: 3 lecturas → F4 → Enter → Enter.

## Cómo probar

```powershell
cd frontend
npm run check:colors; npm run build; npm run test:ci
cd ..
docker compose up --build
# En otra terminal:
cd e2e; npx playwright test; cd ..
```

1. **Tablet**: en DevTools elige un iPad horizontal (1024×768) o "Responsive" 1024×768 con toque. Entra con un cajero
   demo y abre **Vender**.
2. **Sin caja**: aparece "No tienes una caja abierta" con la base de efectivo y "Abrir caja". Con una sola caja libre
   no hay que elegirla. Con un usuario sin `cash:operate` se explica qué permiso pedir.
3. **Cuadrícula**: la primera vez abre en "Todos". Toca la estrella de 2 productos y cambia a "Favoritos": aparecen en
   ese orden. Recarga: siguen ahí (se guardan en este equipo, por negocio). Las categorías filtran; "Ver más productos"
   carga la siguiente página.
4. **Carrito**: toca una tarjeta 3 veces (cantidad 3), usa − y +, toca la línea y pon cantidad 5 y descuento 10 % →
   "Aplicar". Con un usuario sin permiso de descuento el campo dice "Tu usuario no puede dar descuentos". Quita la línea
   con la papelera y usa "Deshacer".
5. **Existencias**: agrega más unidades de las que hay: la línea se pone en amarillo con "Solo hay N en existencia".
6. **Cobro (F4)**: el total se ve grande y el efectivo viene por el total. Toca un billete sugerido: el cambio aparece en
   verde. Cambia a Tarjeta o Transferencia: un solo pago por el total. Activa "Pago mixto" y agrega Transferencia: se
   crea un segundo pago por lo que falta. Si el medio exige referencia, "Registrar venta" se habilita al escribirla.
   Enter en el valor registra.
7. **Éxito**: "Venta registrada" con el cambio; Enter (o "Nueva venta") vuelve al campo de código. "Imprimir tiquete"
   imprime como antes (58/80 mm).
8. **Atajos**: con el campo de código vacío pulsa `?` → lista de atajos. Esc con el popover de una línea abierto solo lo
   cierra; Esc sin nada abierto pregunta si cancelar la venta.
9. **Teclado en pantalla**: en un dispositivo táctil el campo de código no abre el teclado (el lector no lo necesita);
   el botón "Teclado" lo permite.
10. **Sin conexión**: en DevTools → Network → Offline el encabezado dice "Sin conexión" y el cobro avisa.
11. **Tamaños**: ningún botón del POS mide menos de 44 px (DevTools → inspeccionar). En 360 px de ancho la cuadrícula
    va arriba y el carrito debajo.
12. **Modo oscuro**: toda la pantalla y los diálogos legibles.

## Limitaciones y propuestas de backend (ver decisiones 132–143)

- **Existencias**: `GET /inventory/stock` es paginado (máx. 100): se cargan hasta 5 páginas (500 productos con
  inventario) al abrir el POS y después de cada venta; las ventas de otras cajas se ven al terminar la venta propia.
  Propuesta: incluir `stock` de la sucursal en `GET /products` y en `GET /sales/lookup`.
- **Favoritos** locales a cada equipo. Propuesta: `GET /reports/products/top?days=30&branchId` accesible al cajero para
  una pestaña "Más vendidos" compartida.
- La tarjeta muestra el precio de lista; el precio real (lista del cliente) lo calcula el servidor al agregar.
