import { Injectable } from '@angular/core';
import { Observable, defer, finalize } from 'rxjs';

/**
 * Peticiones cuyos errores 4xx se muestran junto al formulario (p. ej. en {@code app-form-dialog}) en lugar de un
 * toast. Mientras una petición envuelta con {@link run} está en curso, el interceptor de errores no muestra toasts
 * para 4xx; los 5xx y la falta de conexión siguen mostrando toast.
 */
@Injectable({ providedIn: 'root' })
export class InlineErrorScope {
  private depth = 0;

  get active(): boolean {
    return this.depth > 0;
  }

  run<T>(source: Observable<T>): Observable<T> {
    return defer(() => {
      this.depth++;
      return source.pipe(finalize(() => (this.depth = Math.max(0, this.depth - 1))));
    });
  }
}
