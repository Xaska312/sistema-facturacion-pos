import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * Plantilla de celda para {@code app-data-table}: {@code <ng-template appCell="nombre" let-row>…</ng-template>}
 * y en la columna {@code template: 'nombre'}.
 */
@Directive({ selector: 'ng-template[appCell]' })
export class CellTemplateDirective {
  readonly appCell = input.required<string>();
  readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
}
