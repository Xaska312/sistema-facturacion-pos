import { Injectable, signal } from '@angular/core';

export type ToastSeverity = 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast';

/** Mismos campos que `MessageService.add` de PrimeNG (los 143 avisos de la app no cambiaron). */
export interface ToastMessage {
  severity?: ToastSeverity | string;
  summary?: string;
  detail?: string;
  /** Milisegundos en pantalla (3000 por defecto). */
  life?: number;
  /** No se cierra solo. */
  sticky?: boolean;
  closable?: boolean;
  key?: string;
}

export interface ActiveToast extends ToastMessage {
  id: number;
}

/** Duración por defecto de un aviso, como en PrimeNG. */
export const DEFAULT_TOAST_LIFE = 3000;

/**
 * Avisos emergentes (decisión 339; reemplaza a `MessageService` de PrimeNG con la misma firma). Los pinta
 * `app-toast-host`, que también los cierra al cumplir su tiempo (y espera mientras el mouse está encima).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  private readonly list = signal<ActiveToast[]>([]);
  /** Avisos en pantalla, del más viejo al más nuevo. */
  readonly messages = this.list.asReadonly();

  add(message: ToastMessage): void {
    this.list.update((all) => [...all, { ...message, id: this.nextId++ }]);
  }

  addAll(messages: ToastMessage[]): void {
    messages.forEach((m) => this.add(m));
  }

  remove(id: number): void {
    this.list.update((all) => all.filter((m) => m.id !== id));
  }

  /** Quita todos, o solo los de un `key`. */
  clear(key?: string): void {
    this.list.update((all) => (key === undefined ? [] : all.filter((m) => m.key !== key)));
  }
}
