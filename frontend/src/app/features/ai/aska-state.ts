import { Injectable, signal } from '@angular/core';

/** Abrir a Aska desde otra pantalla (por ejemplo, la tarjeta del Resumen del día en Inicio). */
@Injectable({ providedIn: 'root' })
export class AskaState {
  /** Cambia cada vez que alguien pide abrirla; el panel lo escucha. */
  readonly openRequests = signal(0);

  open(): void {
    this.openRequests.update((n) => n + 1);
  }
}
