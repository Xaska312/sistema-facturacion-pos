import { WithholdingLine, WithholdingType } from '../../core/api/withholdings.api';
import { formatCop } from '../../shared/money';
import { StatusKey } from '../../shared/status';

/** Consumidor final: no hace retenciones. */
export const FINAL_CONSUMER_ID = '01920000-0000-7000-8000-000000000601';

export const WITHHOLDING_TYPES: readonly { type: WithholdingType; label: string; hint: string }[] = [
  { type: 'RETEFUENTE', label: 'Retefuente', hint: 'sobre el valor sin IVA' },
  { type: 'RETEICA', label: 'ReteICA', hint: 'sobre el valor sin IVA' },
  { type: 'RETEIVA', label: 'ReteIVA', hint: 'sobre el IVA' },
];

export function typeLabel(type: WithholdingType): string {
  return WITHHOLDING_TYPES.find((t) => t.type === type)?.label ?? type;
}

/** "6 %", "0,966 %". */
export function rateText(rate: number | null): string {
  return rate === null ? '—' : `${rate.toLocaleString('es-CO', { maximumFractionDigits: 4 })} %`;
}

/** De lo que se cobra: base gravable (sin impuestos) e IVA. */
export interface TaxBases {
  base: number;
  iva: number;
}

/**
 * Una retención mientras se escribe. {@code base} y {@code amount} nulos: los sugeridos (la base de lo que se cobra y
 * tarifa × base). Solo quien tiene el permiso de finanzas los cambia.
 */
export interface WithholdingDraft {
  type: WithholdingType;
  rate: number | null;
  base: number | null;
  amount: number | null;
}

/** Retención lista: lo que se muestra y se envía. */
export interface ResolvedWithholding {
  type: WithholdingType;
  rate: number | null;
  base: number;
  amount: number;
}

export interface WithholdingResult {
  lines: ResolvedWithholding[];
  /** Lo retenido en total. */
  total: number;
}

export const NO_WITHHOLDING: WithholdingResult = { lines: [], total: 0 };

/** Redondeo al peso como el servidor (mitad hacia arriba); el épsilon cubre 0,1 + 0,2 de los decimales. */
export function pesos(value: number): number {
  return Math.round(value + 1e-7);
}

export function suggestedBase(type: WithholdingType, bases: TaxBases): number {
  return pesos(type === 'RETEIVA' ? bases.iva : bases.base);
}

export function resolveOne(d: WithholdingDraft, bases: TaxBases): ResolvedWithholding {
  const base = d.base ?? suggestedBase(d.type, bases);
  const amount = d.amount ?? (d.rate === null ? 0 : pesos((base * d.rate) / 100));
  return { type: d.type, rate: d.rate, base, amount };
}

/** En una venta: las bases son fijas (las de lo que se cobra). */
export function resolveForSale(drafts: readonly WithholdingDraft[], bases: TaxBases): WithholdingResult {
  const lines = drafts.map((d) => resolveOne(d, bases));
  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/**
 * En un abono: {@code paid} es lo que paga el cliente y la base sale del abono completo (pagado + retenido), que se
 * despeja como lo hace el servidor. {@code basesOf} da las bases de un abono completo.
 */
export function resolveForPayment(drafts: readonly WithholdingDraft[], paid: number,
                                  basesOf: (gross: number) => TaxBases): WithholdingResult & { gross: number } {
  let gross = paid;
  for (let round = 0; round < 25; round++) {
    const sum = paid + resolveForSale(drafts, basesOf(gross)).total;
    if (sum === gross) {
      break;
    }
    gross = sum;
  }
  const result = resolveForSale(drafts, basesOf(gross));
  return { ...result, gross: paid + result.total };
}

/** Bases de {@code amount} cuando el total {@code total} tiene esa base e IVA (en proporción, al peso). */
export function proportionalBases(amount: number, total: number, base: number, iva: number): TaxBases {
  if (total <= 0) {
    return { base: 0, iva: 0 };
  }
  return { base: pesos((amount * base) / total), iva: pesos((amount * iva) / total) };
}

/** Qué falla en las retenciones; nulo si están bien. */
export function withholdingProblem(result: WithholdingResult): string | null {
  for (const l of result.lines) {
    if (l.base <= 0) {
      return l.type === 'RETEIVA' ? 'Este cobro no tiene IVA: quita la reteIVA.' : `Falta la base de la ${typeLabel(l.type)}.`;
    }
    if (!(l.amount > 0)) {
      return `Escribe la tarifa o el valor de la ${typeLabel(l.type)}.`;
    }
    if (l.amount > l.base) {
      return `La ${typeLabel(l.type)} no puede ser mayor que su base.`;
    }
  }
  return null;
}

/** El detalle para el servidor. */
export function toWithholdingLines(result: WithholdingResult): WithholdingLine[] {
  return result.lines.map((l) => ({ type: l.type, base: l.base, rate: l.rate, amount: l.amount }));
}

/** "Retefuente 6 % · ReteICA 0,966 %". */
export function usualText(items: readonly { type: WithholdingType; rate: number }[]): string {
  return items.map((i) => `${typeLabel(i.type)} ${rateText(i.rate)}`).join(' · ');
}

/** "Retiene $ 60.000 · paga $ 1.130.000". */
export function withholdingSummary(total: number, toPay: number): string {
  return `Retiene ${formatCop(total)} · paga ${formatCop(toPay)}`;
}

/** La línea de pago "Retención" con su detalle, o nada si no hay retención. */
export function withholdingPayment(methodId: string | null, result: WithholdingResult):
  { paymentMethodId: string; amount: number; reference: null; withholdings: WithholdingLine[] } | null {
  if (!methodId || result.total <= 0) {
    return null;
  }
  return { paymentMethodId: methodId, amount: result.total, reference: null, withholdings: toWithholdingLines(result) };
}

/** Suma la base gravable y el IVA de unas líneas. */
export function sumBases(lines: readonly { taxBase: number | null; iva: number | null }[]): TaxBases {
  return lines.reduce((acc, l) => ({ base: acc.base + Number(l.taxBase ?? 0), iva: acc.iva + Number(l.iva ?? 0) }),
    { base: 0, iva: 0 });
}

/** Estado de una retención en el reporte. */
export function certificateBadge(w: { reversal: boolean; voided: boolean; certificateReceived: boolean }):
  { key: StatusKey; label: string } {
  if (w.voided) {
    return { key: 'voided', label: 'Venta anulada' };
  }
  if (w.reversal) {
    return { key: 'inactive-f', label: 'Reversada' };
  }
  return w.certificateReceived ? { key: 'completed', label: 'Recibido' } : { key: 'pending', label: 'Pendiente' };
}
