import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { AiApi, AskaMoments } from '../../core/api/ai.api';

const NONE: AskaMoments = { hasAi: false, canBuy: false, trialAvailable: false, emptyStock: false };

/**
 * Aska en el momento del dolor (decisión 308): lo que el servidor dice del negocio (si tiene XASKA IA, si se puede
 * probar, si el inventario está vacío), pedido una vez por sesión, y los productos creados a mano seguidos.
 */
@Injectable({ providedIn: 'root' })
export class AskaMomentsState {
  private readonly api = inject(AiApi);
  private cached: Observable<AskaMoments> | null = null;

  /** Productos creados a mano seguidos en esta sesión; vuelve a cero al usar Cargar con Aska. */
  readonly manualProducts = signal(0);

  moments(): Observable<AskaMoments> {
    this.cached ??= this.api.moments().pipe(catchError(() => of(NONE)), shareReplay(1));
    return this.cached;
  }

  /** Tras activar la prueba o cargar inventario: la próxima pantalla vuelve a preguntar. */
  refresh(): void {
    this.cached = null;
  }

  productCreatedByHand(): void {
    this.manualProducts.update((n) => n + 1);
  }

  resetManualProducts(): void {
    this.manualProducts.set(0);
  }
}
