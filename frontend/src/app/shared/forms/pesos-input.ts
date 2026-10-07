/**
 * Lectura y formato de montos en pesos como los escribe la gente en Colombia: "250.000", "$ 1.500", "1.234,56".
 * Con `<input type="number">` el navegador leía "250.000" como 250 (QA DIN-1).
 */

/**
 * @param decimals decimales permitidos (0 para pagos y caja; 2 para precios y costos); se redondea a esos.
 * @returns el número, o null si está vacío o no es un monto válido (negativos incluidos).
 */
export function parsePesos(raw: string | null | undefined, decimals = 0): number | null {
  let text = (raw ?? '').replace(/cop/gi, '').replace(/[\s$]/g, '');
  if (!text) {
    return null;
  }
  if (text.includes(',')) {
    // 1.234,56: el punto separa miles y la coma los decimales.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // 250.000 / 1.500: puntos de miles.
    text = text.replace(/\./g, '');
  }
  // Si no: "1500" o "12.5" (punto decimal del teclado numérico).
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(text)) {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** Math.max(0, decimals);
  return Math.round(Number((value * factor).toFixed(6))) / factor;
}

const FORMATS = new Map<number, Intl.NumberFormat>();

/** 250000 → "250.000"; con decimales: 1234.5 → "1.234,5". */
export function formatPesosInput(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '';
  }
  let format = FORMATS.get(decimals);
  if (!format) {
    format = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    FORMATS.set(decimals, format);
  }
  return format.format(value);
}
