import { Injectable, signal } from '@angular/core';

/**
 * Abrir a Aska desde otra pantalla (por ejemplo, la tarjeta del Resumen del día en Inicio) o desde un enlace del
 * correo con {@code ?aska=pregunta} (decisión 307), opcionalmente con una pregunta que ella responde de una vez.
 */
@Injectable({ providedIn: 'root' })
export class AskaState {
  /** Cambia cada vez que alguien pide abrirla; el panel lo escucha. */
  readonly openRequests = signal(0);
  private pending: string | null = null;

  open(question?: string): void {
    const q = question?.trim().slice(0, 200);
    this.pending = q ? q : null;
    this.openRequests.update((n) => n + 1);
  }

  /** La pregunta que traía el último pedido (una sola vez). */
  takeQuestion(): string | null {
    const q = this.pending;
    this.pending = null;
    return q;
  }
}
