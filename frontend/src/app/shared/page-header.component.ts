import { Component, input } from '@angular/core';

/** Encabezado de pantalla: título, descripción opcional y acciones (contenido proyectado). */
@Component({
  selector: 'app-page-header',
  template: `
    <header class="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold leading-tight">{{ title() }}</h1>
        @if (description()) {
          <p class="text-sm text-muted mt-1 max-w-2xl">{{ description() }}</p>
        }
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
