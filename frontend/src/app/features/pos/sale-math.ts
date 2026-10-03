/**
 * Cálculo de la venta en pantalla. Replica las reglas del backend (SaleCalculator) para mostrar el total antes de
 * cobrar; el backend recalcula y, si algo difiere, responde 409.
 */

/** Redondeo HALF_UP a 2 decimales sin el ruido binario de los decimales (1.005 → 1.01). */
export function money(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const cents = Math.round(Number((Math.abs(value) * 100).toFixed(6)));
  return (sign * cents) / 100;
}

export interface LineAmounts {
  gross: number;
  discount: number;
  base: number;
  tax: number;
  total: number;
}

/**
 * Bruto = precio × cantidad; descuento = bruto × %.
 * Con IVA incluido: total = bruto − descuento; base = total / (1 + tarifa); impuesto = total − base.
 * Sin IVA: base = bruto − descuento; impuesto = base × tarifa; total = base + impuesto.
 */
export function lineAmounts(price: number, quantity: number, discountPercent: number, taxRate: number,
                            pricesIncludeTax: boolean): LineAmounts {
  const gross = money(price * quantity);
  const discount = money((gross * discountPercent) / 100);
  const net = money(gross - discount);
  if (pricesIncludeTax) {
    const base = money(net / (1 + taxRate / 100));
    return { gross, discount, base, tax: money(net - base), total: net };
  }
  const tax = money((net * taxRate) / 100);
  return { gross, discount, base: net, tax, total: money(net + tax) };
}

export interface CartLine {
  /** productId + unidad: escanear dos veces la misma presentación suma cantidad. */
  key: string;
  productId: string;
  sku: string;
  name: string;
  unitId: string;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  trackInventory: boolean;
}

export interface CartTotals extends LineAmounts {
  items: number;
}

export function cartTotals(lines: CartLine[], pricesIncludeTax: boolean): CartTotals {
  const totals: CartTotals = { gross: 0, discount: 0, base: 0, tax: 0, total: 0, items: 0 };
  for (const line of lines) {
    const a = lineAmounts(line.unitPrice, line.quantity, line.discountPercent, line.taxRate, pricesIncludeTax);
    totals.gross = money(totals.gross + a.gross);
    totals.discount = money(totals.discount + a.discount);
    totals.base = money(totals.base + a.base);
    totals.tax = money(totals.tax + a.tax);
    totals.total = money(totals.total + a.total);
    totals.items += line.quantity;
  }
  return totals;
}

export interface PaymentDraft {
  methodId: string;
  affectsCash: boolean;
  amount: number | null;
  reference: string;
}

export interface PaymentSummary {
  paid: number;
  /** Lo que falta (0 si ya se cubrió). */
  missing: number;
  /** Cambio a entregar (solo sale del efectivo). */
  change: number;
  /** Tarjeta o transferencia por encima del total: no se permite (el cambio solo es en efectivo). */
  nonCashExceeds: boolean;
  valid: boolean;
}

export function summarizePayments(total: number, payments: PaymentDraft[]): PaymentSummary {
  let paid = 0;
  let nonCash = 0;
  let allPositive = true;
  for (const p of payments) {
    const amount = Number(p.amount ?? 0);
    if (!(amount > 0)) {
      allPositive = false;
      continue;
    }
    paid = money(paid + amount);
    if (!p.affectsCash) {
      nonCash = money(nonCash + amount);
    }
  }
  const missing = paid >= total ? 0 : money(total - paid);
  const change = paid > total ? money(paid - total) : 0;
  const nonCashExceeds = nonCash > total;
  const valid = allPositive && missing === 0 && !nonCashExceeds && (payments.length > 0 || total === 0);
  return { paid, missing, change, nonCashExceeds, valid };
}

/** "3*7701234" → cantidad 3 y código; sin asterisco, cantidad 1. */
export function parseScan(raw: string): { quantity: number; code: string } | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const match = /^(\d+(?:[.,]\d+)?)\s*\*\s*(.+)$/.exec(text);
  if (match) {
    const quantity = Number(match[1].replace(',', '.'));
    return quantity > 0 ? { quantity, code: match[2].trim() } : null;
  }
  return { quantity: 1, code: text };
}

/** Billetes sugeridos para pagar en efectivo un total (el exacto y los siguientes redondeos comunes). */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) {
    return [];
  }
  const suggestions = new Set<number>([Math.ceil(total)]);
  for (const step of [1000, 5000, 10000, 20000, 50000, 100000]) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) {
      suggestions.add(rounded);
    }
  }
  return [...suggestions].sort((a, b) => a - b).slice(0, 5);
}
