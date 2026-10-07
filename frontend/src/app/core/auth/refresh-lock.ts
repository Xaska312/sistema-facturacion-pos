import { InjectionToken } from '@angular/core';
import { Observable, Subscription, finalize } from 'rxjs';

/**
 * Ejecuta la renovación de la sesión de a una por navegador (todas las pestañas). La cookie de refresh es una sola:
 * si dos pestañas renuevan a la vez, la segunda llega con la cookie ya rotada y el servidor la rechaza (antes la
 * tomaba como robo y cerraba todas las sesiones: QA SEG-5). Con el candado, la segunda espera y sale con la cookie
 * nueva. Sin Web Locks (navegadores viejos) se ejecuta directo; el servidor tiene además un margen de 30 s.
 */
export type RefreshLock = <T>(source: Observable<T>) => Observable<T>;

export const REFRESH_LOCK_NAME = 'pos-hibrido-refresh';

/** Candado con el LockManager indicado; sin él (navegador viejo), la renovación se ejecuta directo. */
export function lockWith(locks: LockManager | undefined): RefreshLock {
  return <T>(source: Observable<T>): Observable<T> => {
    if (!locks) {
      return source;
    }
    return new Observable<T>((subscriber) => {
      const abort = new AbortController();
      let inner: Subscription | undefined;
      locks
        .request(REFRESH_LOCK_NAME, { signal: abort.signal }, () => new Promise<void>((release) => {
          inner = source.pipe(finalize(() => release())).subscribe(subscriber);
        }))
        .catch((error: unknown) => {
          if (!abort.signal.aborted) {
            subscriber.error(error);
          }
        });
      return () => {
        abort.abort();
        inner?.unsubscribe();
      };
    });
  };
}

export const REFRESH_LOCK = new InjectionToken<RefreshLock>('REFRESH_LOCK', {
  providedIn: 'root',
  factory: () => lockWith(globalThis.navigator?.locks),
});
