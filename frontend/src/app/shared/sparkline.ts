/**
 * Puntos de una mini tendencia (polyline SVG) en una caja de {@code width}×{@code height}.
 * Con todos los valores iguales dibuja una línea a media altura.
 */
export function sparklinePoints(values: readonly number[], width = 100, height = 28, padding = 2): string {
  const clean = values.map((v) => (Number.isFinite(v) ? v : 0));
  if (clean.length === 0) {
    return '';
  }
  if (clean.length === 1) {
    const y = round(height / 2);
    return `0,${y} ${width},${y}`;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min;
  const usable = height - padding * 2;
  const step = width / (clean.length - 1);
  return clean
    .map((value, index) => {
      const x = round(index * step);
      const y = range === 0 ? round(height / 2) : round(padding + usable - ((value - min) / range) * usable);
      return `${x},${y}`;
    })
    .join(' ');
}

/** Variación porcentual frente al valor anterior, con un decimal; null si no hay base para comparar. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
