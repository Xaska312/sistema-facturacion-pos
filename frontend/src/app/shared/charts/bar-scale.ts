/** Punto de una gráfica de barras. */
export interface BarItem {
  label: string;
  value: number;
  /** Texto opcional bajo la barra o al lado (p. ej. cantidad de ventas). */
  hint?: string;
}

/**
 * Porcentaje de cada barra respecto al máximo (0–100). Los negativos se dibujan como 0; si todo es 0, todas quedan
 * en 0. Una barra con valor positivo nunca baja de 2 % para que se vea.
 */
export function barPercents(values: number[]): number[] {
  const max = Math.max(0, ...values.map((v) => (Number.isFinite(v) ? v : 0)));
  if (max <= 0) {
    return values.map(() => 0);
  }
  return values.map((v) => (v > 0 ? Math.max(2, Math.round((v / max) * 1000) / 10) : 0));
}
