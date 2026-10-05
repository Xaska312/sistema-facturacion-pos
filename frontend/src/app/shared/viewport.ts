import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Punto de quiebre "md" de Tailwind (768 px): por debajo, las tablas se muestran como tarjetas. */
export const DESKTOP_QUERY = '(min-width: 768px)';

/**
 * Tamaño de pantalla como signal. Se usa cuando hay que pintar una u otra vista (no ambas ocultas con CSS),
 * p. ej. tabla o tarjetas, para no duplicar contenido para los lectores de pantalla.
 */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  private readonly media: MediaQueryList | null;
  readonly isDesktop = signal(true);

  constructor() {
    const view = inject(DOCUMENT).defaultView;
    this.media = typeof view?.matchMedia === 'function' ? view.matchMedia(DESKTOP_QUERY) : null;
    if (this.media) {
      this.isDesktop.set(this.media.matches);
      const onChange = (event: MediaQueryListEvent) => this.isDesktop.set(event.matches);
      this.media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onChange));
    }
  }
}
