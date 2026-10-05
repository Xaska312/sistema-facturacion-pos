import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, input, untracked, viewChild } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { ThemeService } from '../../core/theme/theme.service';
import { formatCompactCop, formatCop } from '../money';
import {
  ChartKind,
  ChartSeries,
  ChartSpec,
  barConfig,
  chartSummary,
  doughnutConfig,
  lineConfig,
  readChartTheme,
  shareOf,
} from './chart-config';

// Solo los controladores que usa la app (Chart.js se puede "tree-shakear").
Chart.register(BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Legend);
Chart.defaults.font.family = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * Gráfica de la app sobre Chart.js (se importa solo en las pantallas que la usan).
 * - Colores desde los tokens CSS; se vuelve a pintar al cambiar entre claro y oscuro.
 * - Tooltips en pesos (o con {@code format}), ejes abreviados ("$ 1,2 M").
 * - Accesible: el lienzo tiene {@code aria-label} con un resumen y hay una tabla con los datos para lectores de
 *   pantalla; la dona muestra su leyenda en HTML con valor y porcentaje.
 * - Respeta {@code prefers-reduced-motion} (sin animación).
 */
@Component({
  selector: 'app-chart',
  template: `
    <figure class="m-0">
      <div class="relative w-full" [style.height.px]="height()">
        <canvas #canvas role="img" [attr.aria-label]="accessibleLabel()"></canvas>
      </div>
      @if (kind() === 'doughnut') {
        <ul class="mt-3 flex flex-col gap-1.5 text-sm" aria-hidden="true">
          @for (label of labels(); track $index; let i = $index) {
            <li class="flex items-center gap-2">
              <span class="size-2.5 rounded-full shrink-0" [style.background]="'var(--chart-' + (i + 1) + ')'"></span>
              <span class="flex-1 truncate">{{ label }}</span>
              <span class="tabular-nums font-medium">{{ formatValue(valueAt(i)) }}</span>
              <span class="tabular-nums text-muted w-14 text-right">{{ percentAt(i) }}</span>
            </li>
          }
        </ul>
      }
      <table class="sr-only">
        <caption>{{ ariaLabel() }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ categoryHeader() }}</th>
            @for (s of series(); track s.label) {
              <th scope="col">{{ s.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (label of labels(); track $index; let i = $index) {
            <tr>
              <th scope="row">{{ label }}</th>
              @for (s of series(); track s.label) {
                <td>{{ formatValue(s.data[i]) }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </figure>
  `,
})
export class ChartComponent {
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: { destroy(): void } | null = null;

  readonly kind = input<ChartKind>('bar');
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  /** Descripción de la gráfica (título accesible); el resumen de datos se agrega solo. */
  readonly ariaLabel = input.required<string>();
  readonly horizontal = input(false);
  readonly height = input(260);
  /** Encabezado de la primera columna de la tabla para lectores de pantalla. */
  readonly categoryHeader = input('Categoría');
  readonly format = input<(value: number) => string>(formatCop);
  readonly axisFormat = input<(value: number) => string>(formatCompactCop);

  protected readonly accessibleLabel = computed(
    () => `${this.ariaLabel()}. ${chartSummary({ labels: this.labels(), series: this.series(), format: this.format() })}`,
  );

  constructor() {
    effect(() => {
      const canvas = this.canvas()?.nativeElement;
      // Dependencias: datos, opciones y el modo de color.
      const spec: ChartSpec = {
        kind: this.kind(),
        labels: this.labels(),
        series: this.series(),
        horizontal: this.horizontal(),
        format: this.format(),
        axisFormat: this.axisFormat(),
        animate: !this.prefersReducedMotion(),
      };
      this.theme.isDark();
      if (canvas) {
        untracked(() => this.draw(canvas, spec));
      }
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }

  protected formatValue(value: number | undefined): string {
    return value === undefined ? '—' : this.format()(value);
  }

  protected valueAt(index: number): number {
    return this.series()[0]?.data[index] ?? 0;
  }

  protected percentAt(index: number): string {
    const values = this.series()[0]?.data ?? [];
    return `${shareOf(this.valueAt(index), values).toLocaleString('es-CO')} %`;
  }

  private draw(canvas: HTMLCanvasElement, spec: ChartSpec): void {
    this.chart?.destroy();
    const styles = this.document.defaultView?.getComputedStyle(this.document.documentElement);
    const theme = readChartTheme((name) => styles?.getPropertyValue(name) ?? '');
    switch (spec.kind) {
      case 'line':
        this.chart = new Chart(canvas, lineConfig(spec, theme));
        break;
      case 'doughnut':
        this.chart = new Chart(canvas, doughnutConfig(spec, theme));
        break;
      default:
        this.chart = new Chart(canvas, barConfig(spec, theme));
    }
  }

  private prefersReducedMotion(): boolean {
    const view = this.document.defaultView;
    return typeof view?.matchMedia === 'function' && view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
