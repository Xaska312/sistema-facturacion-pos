const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

/** Pesos colombianos sin decimales: 2500 → "$ 2.500". Se almacenan con 2 decimales en el backend. */
export function formatCop(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : COP.format(value).replace(/\u00a0/g, ' ');
}

/** Cantidades y factores: 24 → "24", 0.5 → "0,5". */
export function formatQuantity(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : DECIMAL.format(value);
}

const PERCENT = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Porcentaje con coma decimal: 67.45 → "67,45 %". */
export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${PERCENT.format(value)} %`;
}

const ONE_DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/**
 * Pesos abreviados para ejes de gráficas: 1250000 → "$ 1,3 M", 85000 → "$ 85 mil", 900 → "$ 900".
 * (Se arma a mano: la notación compacta de Intl cambia entre navegadores: "mil", "k", "K".)
 */
export function formatCompactCop(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}$ ${ONE_DECIMAL.format(abs / 1_000_000)} M`;
  }
  if (abs >= 1_000) {
    return `${sign}$ ${ONE_DECIMAL.format(Math.round(abs / 100) / 10)} mil`;
  }
  return `${sign}$ ${ONE_DECIMAL.format(abs)}`;
}
