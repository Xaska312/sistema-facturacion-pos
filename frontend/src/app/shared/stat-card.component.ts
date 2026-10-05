import { Component, computed, input } from '@angular/core';
import { sparklinePoints } from './sparkline';

/**
 * Tarjeta de indicador (KPI): icono, etiqueta, valor, variación frente al periodo anterior y mini tendencia.
 * La variación se colorea en verde/rojo; con {@code invertTrend} (p. ej. anulaciones) subir es malo.
 */
@Component({
  selector: 'app-stat-card',
  template: `
    <article class="card p-4 flex flex-col gap-2 min-w-0">
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-muted truncate">{{ label() }}</p>
        @if (icon()) {
          <span class="inline-flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand-soft-fg shrink-0"
                aria-hidden="true">
            <i [class]="icon()"></i>
          </span>
        }
      </div>
      <p class="text-2xl font-semibold tabular-nums truncate">{{ value() }}</p>
      <div class="flex items-end justify-between gap-2 min-h-7">
        <div class="text-xs">
          @if (change() !== null) {
            <span class="inline-flex items-center gap-1 font-medium" [class]="changeClass()">
              <i class="pi text-[10px]" [class.pi-arrow-up]="change()! > 0" [class.pi-arrow-down]="change()! < 0"
                 [class.pi-minus]="change() === 0" aria-hidden="true"></i>
              {{ changeText() }}
            </span>
            <span class="text-muted"> {{ changeLabel() }}</span>
          } @else if (hint()) {
            <span class="text-muted">{{ hint() }}</span>
          }
        </div>
        @if (points()) {
          <svg viewBox="0 0 100 28" class="w-24 h-7 shrink-0 text-brand" preserveAspectRatio="none" aria-hidden="true">
            <polyline [attr.points]="points()" fill="none" stroke="currentColor" stroke-width="2"
                      stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          </svg>
        }
      </div>
    </article>
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input<string | null>(null);
  /** Variación en % (null = sin comparación). */
  readonly change = input<number | null>(null);
  readonly changeLabel = input('vs. ayer');
  readonly invertTrend = input(false);
  /** Texto bajo el valor cuando no hay variación. */
  readonly hint = input<string | null>(null);
  /** Valores para la mini tendencia (2 o más). */
  readonly trend = input<readonly number[]>([]);

  protected readonly points = computed(() => (this.trend().length > 1 ? sparklinePoints(this.trend()) : ''));
  protected readonly changeText = computed(() => {
    const change = this.change();
    if (change === null) {
      return '';
    }
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
  });
  protected readonly changeClass = computed(() => {
    const change = this.change() ?? 0;
    if (change === 0) {
      return 'text-muted';
    }
    const good = this.invertTrend() ? change < 0 : change > 0;
    return good ? 'text-success' : 'text-danger';
  });
}
