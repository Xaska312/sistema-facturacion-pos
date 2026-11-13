# shared/ui — componentes propios (reemplazaron a PrimeNG)

Decisiones 335 a 340. Construidos sobre `@angular/cdk` (A11y: `CdkTrapFocus`) y estilos propios en `styles.css`
(clases `.ui-*`, `.app-input`, `.app-skeleton` y tokens). PrimeNG ya no está en el proyecto; los íconos `pi pi-*` siguen
siendo de PrimeIcons (MIT, paquete aparte).

| Pieza | Archivo | Reemplazó a |
| --- | --- | --- |
| `[appInput]` | `input.directive.ts` | `pInputText` |
| `app-skeleton` | `skeleton.component.ts` | `p-skeleton` |
| `app-button`, `a[appButton]` | `button.component.ts`, `button-link.component.ts` | `p-button`, `a[pButton]` |
| `app-dialog`, `app-confirm-host` | `dialog.component.ts`, `confirm-host.component.ts` | `p-dialog`, `p-confirmdialog` |
| `ToastService`, `app-toast-host` | `toast.service.ts`, `toast-host.component.ts` | `MessageService`, `p-toast` |
| `app-menu` (+ `MenuItem`) | `menu.component.ts`, `menu-item.ts` | `p-menu` |
| `app-popover`, `[appTooltip]`, `app-drawer` | `popover.component.ts`, `tooltip.directive.ts`, `drawer.component.ts` | `p-popover`, `pTooltip`, `p-drawer` |
| `app-paginator`, `app-password` | `paginator.component.ts`, `password.component.ts` | `p-paginator`, `p-password` |
| Capas y posición | `overlay.ts` | `ZIndexUtils`, `absolutePosition` |

Reglas:

- Mismos nombres de entradas que tenía PrimeNG; los eventos `on…` pasaron a `(clicked)`, `(shown)`, `(hidden)`,
  `(pageChange)`.
- Solo tokens de color (`tools/check-colors.mjs`) y las medidas `--ui-*` de `styles.css`.
- Accesibilidad igual o mejor: `type="button"` por defecto, `role="dialog"` con título enlazado, foco atrapado y
  devuelto, Escape, `role="alert"` en los avisos, teclado en los menús, `prefers-reduced-motion`.
- Siguiente (fase E, aprobada): la dirección visual "Orgánica" cambiando sobre todo las variables `--ui-*`.
- Antes y después de cambiar algo visible: capturas de `e2e/tests/visual.spec.ts` (`VISUAL=1`).
