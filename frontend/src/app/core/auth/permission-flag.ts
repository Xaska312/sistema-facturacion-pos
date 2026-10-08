import { Signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Permiso de la sesión como señal: se actualiza si el token cambia (renovación con otro rol, otro negocio en otra
 * pestaña) en vez de leerse una sola vez al abrir la pantalla (QA UI-13). Solo UX: el backend valida cada permiso.
 * Llamar en un contexto de inyección (inicializador de campo o constructor).
 */
export function permissionFlag(permission: string): Signal<boolean> {
  const auth = inject(AuthService);
  return computed(() => auth.hasPermission(permission));
}
