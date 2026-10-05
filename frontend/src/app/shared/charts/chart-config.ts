import type { ChartConfiguration, TooltipItem } from 'chart.js';

/** Tipos de gráfica de la app (una sola escala Y: nunca doble eje). */
export type ChartKind = 'bar' | 'line' | 'doughnut';

export interface ChartSeries {
  label: string;
  data: readonly number[];
  /** 'compare' = periodo anterior: gris y punteada, siempre detrás de la serie principal. */
  role?: 'primary' | 'compare';
}

export interface ChartSpec {
  kind: ChartKind;
  labels: readonly string[];
  series: readonly ChartSeries[];
  /** Barras horizontales (rankings con etiquetas largas, p. ej. productos). */
  horizontal?: boolean;
  /** Formato de los valores en tooltips y tabla (por defecto pesos). */
  format: (value: number) => string;
  /** Formato corto para el eje de valores. */
  axisFormat: (value: number) => string;
  animate: boolean;
}

/** Colores resueltos de los tokens CSS (cambian con el modo oscuro). */
export interface ChartTheme {
  series: string[];
  compare: string;
  grid: string;
  text: string;
  muted: string;
  surface: string;
}

export const CHART_SERIES_SLOTS = 6;

/** Lee los tokens de color de las gráficas ({@code --chart-1}… en styles.css). */
export function readChartTheme(read: (cssVar: string) => string): ChartTheme {
  // Los valores de respaldo solo se usan si faltan los tokens (p. ej. en pruebas sin styles.css).
  const value = (name: string, fallback: string): string => read(name).trim() || fallback;
  return {
    series: Array.from({ length: CHART_SERIES_SLOTS }, (_, i) => value(`--chart-${i + 1}`, '#0d9488')), // color-literal-ok
    compare: value('--chart-compare', '#839290'), // color-literal-ok
    grid: value('--chart-grid', '#e6ebeb'), // color-literal-ok
    text: value('--text', '#12201f'), // color-literal-ok
    muted: value('--text-muted', '#4f5f5d'), // color-literal-ok
    surface: value('--surface', '#ffffff'), // color-literal-ok
  };
}

/**
 * Color de la serie {@code index}: orden fijo de los tokens (nunca se generan colores nuevos);
 * la comparación siempre es gris.
 */
export function seriesColor(theme: ChartTheme, index: number, role: ChartSeries['role']): string {
  if (role === 'compare') {
    return theme.compare;
  }
  return theme.series[Math.min(index, theme.series.length - 1)];
}

/**
 * Agrupa en "Otros" lo que pase de {@code max} categorías (para la dona: más de 6 colores no se distinguen).
 */
export function foldOthers(items: readonly { label: string; value: number }[], max = CHART_SERIES_SLOTS):
  { label: string; value: number }[] {
  if (items.length <= max) {
    return [...items];
  }
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1).reduce((sum, item) => sum + item.value, 0);
  return [...kept, { label: 'Otros', value: rest }];
}

/** Resumen corto para lectores de pantalla: total y punto más alto de la serie principal. */
export function chartSummary(spec: Pick<ChartSpec, 'labels' | 'series' | 'format'>): string {
  const main = spec.series.find((s) => s.role !== 'compare') ?? spec.series[0];
  if (!main || main.data.length === 0) {
    return 'Sin datos.';
  }
  const total = main.data.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  if (total === 0) {
    return 'Sin valores en el periodo.';
  }
  let maxIndex = 0;
  main.data.forEach((v, i) => {
    if (v > main.data[maxIndex]) {
      maxIndex = i;
    }
  });
  return `Total ${spec.format(total)}. Mayor valor: ${spec.labels[maxIndex] ?? ''}, ${spec.format(main.data[maxIndex])}.`;
}

/** Porcentaje de cada valor sobre el total, con un decimal. */
export function shareOf(value: number, values: readonly number[]): number {
  const total = values.reduce((sum, v) => sum + v, 0);
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function tooltipBase(theme: ChartTheme) {
  return {
    backgroundColor: theme.text,
    titleColor: theme.surface,
    bodyColor: theme.surface,
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
  };
}

function legendOptions(spec: ChartSpec, theme: ChartTheme) {
  return {
    display: spec.series.length > 1,
    position: 'bottom' as const,
    labels: { color: theme.text, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 },
  };
}

function valueAxis(spec: ChartSpec, theme: ChartTheme) {
  return {
    beginAtZero: true,
    grid: { color: theme.grid },
    border: { display: false },
    ticks: {
      color: theme.muted,
      maxTicksLimit: 5,
      callback: (value: number | string): string => spec.axisFormat(Number(value)),
    },
  };
}

function categoryAxis(theme: ChartTheme) {
  return {
    grid: { display: false },
    border: { color: theme.grid },
    ticks: { color: theme.muted, autoSkip: true, maxRotation: 0 },
  };
}

export function barConfig(spec: ChartSpec, theme: ChartTheme): ChartConfiguration<'bar', number[], string> {
  const horizontal = spec.horizontal ?? false;
  return {
    type: 'bar',
    data: {
      labels: [...spec.labels],
      datasets: spec.series.map((series, index) => {
        const color = seriesColor(theme, index, series.role);
        return {
          label: series.label,
          data: [...series.data],
          backgroundColor: color,
          hoverBackgroundColor: color,
          borderRadius: 4,
          // Esquinas redondeadas solo en el extremo del dato; la base queda recta.
          borderSkipped: 'start' as const,
          maxBarThickness: 32,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        };
      }),
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      animation: spec.animate ? { duration: 200 } : false,
      plugins: {
        legend: legendOptions(spec, theme),
        tooltip: {
          ...tooltipBase(theme),
          displayColors: spec.series.length > 1,
          callbacks: {
            label: (item: TooltipItem<'bar'>): string => `${item.dataset.label ?? ''}: ${spec.format(Number(item.raw))}`,
          },
        },
      },
      scales: horizontal
        ? { x: valueAxis(spec, theme), y: categoryAxis(theme) }
        : { x: categoryAxis(theme), y: valueAxis(spec, theme) },
    },
  };
}

export function lineConfig(spec: ChartSpec, theme: ChartTheme): ChartConfiguration<'line', number[], string> {
  return {
    type: 'line',
    data: {
      labels: [...spec.labels],
      datasets: spec.series.map((series, index) => {
        const color = seriesColor(theme, index, series.role);
        const compare = series.role === 'compare';
        return {
          label: series.label,
          data: [...series.data],
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2,
          borderDash: compare ? [6, 4] : [],
          pointRadius: series.data.length > 31 ? 0 : 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          pointBorderColor: theme.surface,
          pointBorderWidth: 2,
          tension: 0.3,
          fill: false,
          order: compare ? 2 : 1,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: spec.animate ? { duration: 200 } : false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: legendOptions(spec, theme),
        tooltip: {
          ...tooltipBase(theme),
          displayColors: spec.series.length > 1,
          callbacks: {
            label: (item: TooltipItem<'line'>): string => `${item.dataset.label ?? ''}: ${spec.format(Number(item.raw))}`,
          },
        },
      },
      scales: { x: categoryAxis(theme), y: valueAxis(spec, theme) },
    },
  };
}

export function doughnutConfig(spec: ChartSpec, theme: ChartTheme): ChartConfiguration<'doughnut', number[], string> {
  const values = spec.series[0]?.data ?? [];
  return {
    type: 'doughnut',
    data: {
      labels: [...spec.labels],
      datasets: [
        {
          label: spec.series[0]?.label ?? '',
          data: [...values],
          backgroundColor: values.map((_, index) => seriesColor(theme, index, 'primary')),
          // Separación de 2 px con el color de la superficie entre los segmentos.
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      animation: spec.animate ? { duration: 200 } : false,
      plugins: {
        // La leyenda va en HTML junto a la gráfica, con valor y porcentaje.
        legend: { display: false },
        tooltip: {
          ...tooltipBase(theme),
          callbacks: {
            label: (item: TooltipItem<'doughnut'>): string => {
              const value = Number(item.raw);
              return `${item.label}: ${spec.format(value)} (${shareOf(value, values).toLocaleString('es-CO')} %)`;
            },
          },
        },
      },
    },
  };
}
