import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MENU } from '../features/shell/menu';
import { XIconComponent } from './icons/xicon.component';
import { XIconName } from './icons/xicons';

/**
 * Ícono propio del módulo de una dirección: el de la opción del menú más larga que la contiene
 * ("/app/productos/nuevo" → productos). El inicio ("/app") solo cuenta si es exacto.
 */
export function glyphForUrl(url: string): XIconName | null {
  const path = url.split(/[?#]/)[0];
  let best: { route: string; glyph: XIconName } | null = null;
  for (const item of MENU) {
    const matches = path === item.route || (item.route !== '/app' && path.startsWith(item.route + '/'));
    if (matches && (!best || item.route.length > best.route.length)) {
      best = item;
    }
  }
  return best?.glyph ?? null;
}

/**
 * Encabezado de pantalla: ícono del módulo en baldosa (el del menú, según la dirección; o {@code glyph}), título,
 * descripción opcional y acciones (contenido proyectado). Estilo de la identidad XASKA (decisión 264).
 */
@Component({
  selector: 'app-page-header',
  imports: [XIconComponent],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div class="flex items-center gap-3.5 min-w-0">
        @if (icon(); as name) {
          <span class="glyph-tile" aria-hidden="true"><app-xicon [name]="name" [size]="28" /></span>
        }
        <div class="min-w-0">
          <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">{{ title() }}</h1>
          @if (description()) {
            <p class="text-sm text-muted mt-0.5 max-w-2xl">{{ description() }}</p>
          }
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .glyph-tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 1.125rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-card);
      color: var(--text);
    }
  `,
})
export class PageHeaderComponent {
  private readonly router = inject(Router, { optional: true });

  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  /** Ícono propio; si no se da, el del módulo de la dirección actual (ninguno fuera del menú). */
  readonly glyph = input<XIconName | null>(null);

  protected readonly icon = computed(() => this.glyph() ?? (this.router ? glyphForUrl(this.router.url) : null));
}
