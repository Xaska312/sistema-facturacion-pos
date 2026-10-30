/**
 * Propina voluntaria al cobrar una mesa (Fase 12b-5; ley 1935 de 2018): se sugiere un porcentaje sobre el valor antes
 * de impuestos y el cliente decide (sí, otro valor o no). Va aparte de la venta: no suma al total ni lleva impuestos.
 */
export type TipChoice = 'suggested' | 'custom' | 'none';

/** Propina sugerida en pesos enteros sobre la base sin impuestos. */
export function suggestedTip(base: number, percent: number): number {
  return percent > 0 && base > 0 ? Math.round((base * percent) / 100) : 0;
}

export function tipAmount(choice: TipChoice, base: number, percent: number, custom: number | null): number {
  if (choice === 'suggested') {
    return suggestedTip(base, percent);
  }
  return choice === 'custom' ? Math.max(0, Math.round(Number(custom ?? 0))) : 0;
}

/** Partes iguales en pesos enteros; la última se lleva el redondeo ("dividir entre 3"). */
export function equalParts(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts));
  const each = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - each * (n - 1) : each));
}
