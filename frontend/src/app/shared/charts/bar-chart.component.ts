import { Component, computed, input } from '@angular/core';
import { BarItem, barPercents } from './bar-scale';

/**
 * Gráfica de barras sin librerías (HTML + CSS). Toda la app dibuja sus gráficas con este componente: para pasar a
 * una librería (p. ej. Chart.js) basta con reemplazar su plantilla manteniendo las mismas entradas.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    @if (orientation() === 'vertical') {
      <div class="flex items-end gap-1 w-full" [style.height.px]="height()" role="img" [attr.aria-label]="ariaLabel()">
        @for (bar of bars(); track $index) {
          <div class="flex-1 min-w-0 flex flex-col items-center justify-end h-full group"
               [title]="bar.label + ': ' + format()(bar.value)">
            <div class="w-full rounded-t bg-brand group-hover:bg-brand-hover transition-colors"
                 [style.height.%]="bar.percent"></div>
          </div>
        }
      </div>
      <div class="flex gap-1 w-full mt-1">
        @for (bar of bars(); track $index; let i = $index) {
          <span class="flex-1 min-w-0 text-[10px] text-muted text-center truncate">
            {{ i % labelEvery() === 0 ? bar.label : '' }}
          </span>
        }
      </div>
    } @else {
      <ul class="space-y-2" role="img" [attr.aria-label]="ariaLabel()">
        @for (bar of bars(); track $index) {
          <li>
            <div class="flex justify-between gap-2 text-sm">
              <span class="truncate">{{ bar.label }}</span>
              <span class="whitespace-nowrap font-medium">{{ format()(bar.value) }}</span>
            </div>
            <div class="h-2 bg-surface-alt rounded">
              <div class="h-2 rounded bg-brand" [style.width.%]="bar.percent"></div>
            </div>
            @if (bar.hint) {
              <p class="text-xs text-muted">{{ bar.hint }}</p>
            }
          </li>
        } @empty {
          <li class="text-sm text-muted">Sin datos.</li>
        }
      </ul>
    }
  `,
})
export class BarChartComponent {
  readonly items = input.required<BarItem[]>();
  readonly format = input<(value: number) => string>((value: number) => String(value));
  readonly orientation = input<'vertical' | 'horizontal'>('horizontal');
  readonly height = input(140);
  /** En barras verticales, cada cuántas barras mostrar la etiqueta. */
  readonly labelEvery = input(1);
  readonly ariaLabel = input('Gráfica de barras');

  protected readonly bars = computed(() => {
    const items = this.items();
    const percents = barPercents(items.map((i) => i.value));
    return items.map((item, i) => ({ ...item, percent: percents[i] }));
  });
}
