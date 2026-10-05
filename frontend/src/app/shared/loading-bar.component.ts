import { Component, inject } from '@angular/core';
import { LoadingService } from '../core/loading/loading';

/**
 * Barra de progreso fina en el borde superior mientras hay peticiones HTTP en curso.
 * Aparece con un pequeño retraso para no parpadear en respuestas rápidas.
 */
@Component({
  selector: 'app-loading-bar',
  template: `
    @if (loading.active()) {
      <div class="loading-bar" role="progressbar" aria-label="Cargando" aria-busy="true">
        <span class="loading-bar__fill"></span>
      </div>
    }
  `,
  styles: `
    .loading-bar {
      position: fixed;
      inset: 0 0 auto 0;
      height: 3px;
      z-index: 2000;
      overflow: hidden;
      pointer-events: none;
      opacity: 0;
      animation: loading-bar-in 150ms ease-out 200ms forwards;
    }
    .loading-bar__fill {
      position: absolute;
      inset: 0 auto 0 0;
      width: 40%;
      background: var(--brand);
      animation: loading-bar-move 1.1s ease-in-out infinite;
    }
    @keyframes loading-bar-in {
      to { opacity: 1; }
    }
    @keyframes loading-bar-move {
      from { transform: translateX(-100%); }
      to { transform: translateX(250%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .loading-bar { animation: none; opacity: 1; }
      .loading-bar__fill { animation: none; width: 100%; opacity: 0.6; }
    }
  `,
})
export class LoadingBarComponent {
  protected readonly loading = inject(LoadingService);
}
