import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ConfirmService } from './confirm';

/** Pantallas con trabajo que se perdería al salir (documento de inventario, producto, carrito del POS). */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Pide confirmación antes de salir de una pantalla con cambios sin guardar (QA UI-7). Cerrar o recargar la pestaña lo
 * cubre {@link warnIfUnsaved}. No pregunta al cerrar sesión ni cuando la sesión venció (ir al login): quedarse en la
 * pantalla sin sesión no sirve de nada.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component, _route, _state, nextState) => {
  if (!component?.hasUnsavedChanges()) {
    return true;
  }
  const toLogin = (nextState?.url ?? '').startsWith('/login');
  if (toLogin || !inject(AuthService).isAuthenticated()) {
    return true;
  }
  const confirm = inject(ConfirmService);
  return new Promise<boolean>((resolve) =>
    confirm.ask({
      header: 'Cambios sin guardar',
      message: 'Si sales ahora, lo que llevas se pierde.',
      acceptLabel: 'Salir sin guardar',
      rejectLabel: 'Seguir aquí',
      danger: true,
      accept: () => resolve(true),
      reject: () => resolve(false),
    }),
  );
};

/** Para {@code window:beforeunload}: el navegador muestra su propio aviso al cerrar o recargar la pestaña. */
export function warnIfUnsaved(event: BeforeUnloadEvent, unsaved: boolean): void {
  if (unsaved) {
    event.preventDefault();
    // Algunos navegadores (Safari) aún lo necesitan para mostrar el aviso.
    event.returnValue = '';
  }
}
