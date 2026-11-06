import { Sale, SaleTip } from '../../core/api/api.models';

/**
 * Un cobro de mesa partido entre cajas (decisión 294): una venta por carta ("Piso 1", "Piso 2"), pero el cliente
 * recibe un solo tiquete con las partes, el total de todo, la propina, lo que pagó y el cambio.
 */
export interface SplitSummary {
  parts: Sale[];
  total: number;
  tip: SaleTip | null;
  change: number;
  /** Lo entregado por medio de pago, sumando las partes. */
  payments: { methodName: string; tendered: number }[];
}

export function splitSummary(sale: Sale): SplitSummary | null {
  const parts = sale.together ?? [];
  if (parts.length < 2) {
    return null;
  }
  const payments: { methodName: string; tendered: number }[] = [];
  for (const p of parts.flatMap((part) => part.payments)) {
    const found = payments.find((x) => x.methodName === p.methodName);
    if (found) {
      found.tendered = round(found.tendered + p.tendered);
    } else {
      payments.push({ methodName: p.methodName, tendered: p.tendered });
    }
  }
  return {
    parts,
    total: round(parts.reduce((sum, p) => sum + p.total, 0)),
    tip: parts.map((p) => p.tip).find((t): t is SaleTip => !!t) ?? null,
    change: round(parts.reduce((sum, p) => sum + p.changeAmount, 0)),
    payments,
  };
}

/** Lo que pagó el cliente por todo: el total de la venta o, si se partió, el de todas las partes. */
export function grandTotal(sale: Sale): number {
  return splitSummary(sale)?.total ?? sale.total;
}

/** Cambio de todo el cobro (queda en la parte de la caja que cobra). */
export function grandChange(sale: Sale): number {
  return splitSummary(sale)?.change ?? sale.changeAmount;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
