import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

/** Marca una petición que no debe encender la barra de carga global (p. ej. consultas en segundo plano). */
export const SKIP_GLOBAL_LOADING = new HttpContextToken<boolean>(() => false);

/** Cuenta las peticiones HTTP en curso para la barra de progreso superior. */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0);
  readonly active = computed(() => this.pending() > 0);

  start(): void {
    this.pending.update((n) => n + 1);
  }

  stop(): void {
    this.pending.update((n) => Math.max(0, n - 1));
  }
}

/** Enciende la barra mientras haya peticiones en curso (también si terminan en error o se cancelan). */
export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(SKIP_GLOBAL_LOADING)) {
    return next(request);
  }
  const loading = inject(LoadingService);
  loading.start();
  return next(request).pipe(finalize(() => loading.stop()));
};
