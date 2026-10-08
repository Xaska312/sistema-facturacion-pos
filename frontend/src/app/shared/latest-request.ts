import { MonoTypeOperatorFunction, Observable, Subscriber } from 'rxjs';

/**
 * Para listas que se recargan al filtrar, buscar o paginar: al empezar una petición se cancela la anterior, así una
 * respuesta lenta y vieja nunca pisa la más reciente (QA UI-10). Uso: {@code .pipe(this.latest.only())}.
 */
export class LatestRequest {
  private previous: Subscriber<unknown> | null = null;

  only<T>(): MonoTypeOperatorFunction<T> {
    return (source) =>
      new Observable<T>((subscriber) => {
        this.previous?.unsubscribe();
        this.previous = subscriber;
        const inner = source.subscribe(subscriber);
        return () => {
          inner.unsubscribe();
          if (this.previous === subscriber) {
            this.previous = null;
          }
        };
      });
  }
}
