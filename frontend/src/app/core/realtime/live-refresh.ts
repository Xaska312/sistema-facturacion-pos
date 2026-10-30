import { DestroyRef, inject } from '@angular/core';
import { debounceTime, filter } from 'rxjs';
import { DiningEvent, DiningEventsService } from './dining-events.service';

export interface LiveRefreshOptions {
  /** Qué avisos le interesan a la pantalla (por defecto, todos). */
  when?: (event: DiningEvent) => boolean;
  /** Vuelve a pedir los datos. */
  load: () => void;
  /** Sin conexión en tiempo real, cada cuánto consultar (respaldo). */
  fallbackMs: number;
  /** Conectado, cada cuánto refrescar de todos modos (para los "hace 5 min"); por defecto 60 s. */
  slowMs?: number;
}

/**
 * Pantalla al día (Fase 12b-4): recarga al llegar un aviso que le interesa (agrupando los que llegan juntos) y, como
 * respaldo, consulta cada {@code fallbackMs} mientras no haya conexión en tiempo real. Llamar en un contexto de
 * inyección (constructor o inicializador de campo); se detiene sola al cerrar la pantalla.
 */
export function liveRefresh(options: LiveRefreshOptions): void {
  const events = inject(DiningEventsService);
  const destroyRef = inject(DestroyRef);
  const slowMs = options.slowMs ?? 60_000;
  const subscription = events.events$.pipe(
    filter((e) => !options.when || options.when(e)),
    debounceTime(250),
  ).subscribe(() => options.load());
  let last = Date.now();
  const timer = setInterval(() => {
    const due = events.connected() ? slowMs : options.fallbackMs;
    if (Date.now() - last >= due - 250) {
      last = Date.now();
      options.load();
    }
  }, Math.min(options.fallbackMs, 5000));
  destroyRef.onDestroy(() => {
    clearInterval(timer);
    subscription.unsubscribe();
  });
}
