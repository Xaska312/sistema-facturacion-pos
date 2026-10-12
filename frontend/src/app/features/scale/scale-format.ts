import { ScaleFormat } from '../../core/api/api.models';

/** Dígitos que le quedan al valor (peso o precio) en los 12 primeros del EAN-13. */
export function valueDigits(format: Pick<ScaleFormat, 'prefix' | 'pluDigits'>): number {
  return 12 - format.prefix.length - format.pluDigits;
}

/** Motivo por el que el formato no sirve (null = sirve). Las mismas reglas que el servidor. */
export function formatProblem(format: ScaleFormat): string | null {
  if (!/^2[0-8]?$/.test(format.prefix)) {
    return 'El prefijo es 2 o va de 20 a 28 (29 es el de los códigos internos).';
  }
  const digits = valueDigits(format);
  if (digits < 4 || digits > 7) {
    return `Con ese prefijo y ese PLU, al valor le quedan ${digits} dígitos: deben ser de 4 a 7.`;
  }
  return null;
}

/** Dígito de control EAN-13 de los 12 primeros dígitos. */
export function ean13Check(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Ejemplo de etiqueta para el PLU 123: 0,750 kg con peso o $12.500 con precio. */
export function exampleLabel(format: ScaleFormat): { code: string; parts: string[]; meaning: string } {
  const digits = valueDigits(format);
  const plu = '123'.padStart(format.pluDigits, '0');
  // Con 4 dígitos para el valor el precio máximo es $9.999: el ejemplo usa uno que quepa.
  const raw = format.kind === 'WEIGHT' ? Math.round(0.75 * 10 ** format.decimals) : digits >= 5 ? 12500 : 2500;
  const value = String(raw).padStart(digits, '0').slice(-digits);
  const first12 = format.prefix + plu + value;
  const check = String(ean13Check(first12));
  const meaning = format.kind === 'WEIGHT'
    ? `PLU 123, ${(raw / 10 ** format.decimals).toLocaleString('es-CO', { maximumFractionDigits: 3 })} kg`
    : `PLU 123, $ ${raw.toLocaleString('es-CO')}`;
  return { code: first12 + check, parts: [format.prefix, plu, value, check], meaning };
}
