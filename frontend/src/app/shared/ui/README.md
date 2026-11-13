# shared/ui — componentes propios (reemplazo de PrimeNG)

Decisión 335. Se construyen por fases sobre `@angular/cdk` (Overlay, Dialog, A11y, Menu) y conviven con PrimeNG
hasta la fase D, cuando se quitan `primeng`, `@primeuix/themes`, `providePrimeNG` y `core/theme/app-preset.ts`.

| Fase | Componentes | Reemplaza |
| --- | --- | --- |
| A1 | `[appInput]`, `app-skeleton` | `pInputText`, `p-skeleton` |
| A2 | `app-button`, `a[appButton]` | `p-button`, `a[pButton]` |
| B | `app-dialog`, confirmación de `ConfirmService` | `p-dialog`, `p-confirmdialog` |
| C | `ToastService`, `app-menu`, `app-popover`, `[appTooltip]`, `app-drawer` | toast, menu, popover, tooltip, drawer |
| D | `app-paginator`, `app-password` | paginator, password |
| E | Dirección visual "Orgánica" (solo cambian las variables `--ui-*` de `styles.css`) | — |

Reglas:

- Mismos nombres de entradas que PrimeNG para que el cambio en las pantallas sea mínimo (lo hace un script).
- Solo tokens de color (`tools/check-colors.mjs`) y las medidas `--ui-*` de `styles.css`: nada de valores sueltos.
- Accesibilidad igual o mejor que hoy: `type="button"` por defecto, `role="dialog"` con título enlazado, foco atrapado
  y devuelto, Escape, `aria-live` en los avisos, teclado en los menús, `prefers-reduced-motion`.
- Sin cambios de funcionalidad ni de diseño hasta la fase E. Antes de cada fase y después: capturas de
  `e2e/tests/visual.spec.ts` (`VISUAL=1`).
