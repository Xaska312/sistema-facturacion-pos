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
