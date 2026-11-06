import { Product } from '../../core/api/api.models';
import { InvoiceDraftLine, InvoiceMatchBy, PurchaseLine, PurchaseLineInput, PurchaseSummary } from '../../core/api/purchases.api';
import { formatCop } from '../../shared/money';
import { StatusKey } from '../../shared/status';

/**
 * Recepción de compras (Fase 13-2, decisión 280). Las mismas reglas que PurchaseService (el servidor las vuelve a
 * aplicar): lote y vencimiento en lo que los controla, nada vencido, temperatura de 2 a 8 °C si llega algo de nevera,
 * motivo en cada rechazo y al menos un producto aceptado.
 */
export interface ReceiptDraftLine {
  key: number;
  productId: string;
  sku: string;
  name: string;
  units: { id: string; code: string; factor: number }[];
  unitId: string;
  quantity: number | null;
  /** Costo promedio actual por unidad base: se propone al cambiar de presentación. */
  baseCost: number;
  /** Costo por la unidad elegida, antes de IVA. */
  unitCost: number | null;
  taxRate: number;
  tracksLots: boolean;
  coldChain: boolean;
  lotNumber: string;
  expirationDate: string;
  rejected: boolean;
  rejectReason: string;
  /** Lo que viene de la factura cargada (decisión 290). */
  invoice?: InvoiceLineInfo;
}

/** De dónde salió la línea cuando se cargó la factura: para resaltar lo que hay que revisar y recordar el código. */
export interface InvoiceLineInfo {
  description: string;
  supplierCode: string | null;
  /** MANUAL: lo eligió la persona en la pantalla. */
  matchedBy: InvoiceMatchBy | 'MANUAL';
  /** Costo por unidad base de la última compra (o el promedio). */
  lastCost: number | null;
  /** La factura viene por caja o paquete. */
  unitCode: string | null;
  packageUnit: boolean;
}

/** Revisión técnica al recibir (Resolución 1403 de 2007): se confirma cada punto antes de registrar. */
export const TECHNICAL_CHECKS: readonly string[] = [
  'La factura corresponde a lo que llegó: productos, cantidades y precios.',
  'Empaques sin daños, limpios, sellados y sin señales de adulteración.',
  'Etiquetas legibles, en español, con registro sanitario INVIMA vigente.',
  'Lote y fecha de vencimiento en el empaque, iguales a los que anoto.',
  'El proveedor es un distribuidor autorizado y conservo la factura.',
];

export const LOT_PATTERN = /^[A-Z0-9][A-Z0-9 ./_-]{0,39}$/;
export const COLD_MIN = 2;
export const COLD_MAX = 8;

export function receiptLine(product: Product, key: number): ReceiptDraftLine {
  const units = [
    { id: product.baseUnitId, code: product.baseUnitCode ?? '', factor: 1 },
    ...product.conversions.map((c) => ({ id: c.unitId, code: c.unitCode ?? '', factor: c.factor })),
  ];
  return {
    key,
    productId: product.id,
    sku: product.sku,
    name: product.name,
    units,
    unitId: product.baseUnitId,
    quantity: null,
    baseCost: product.cost,
    unitCost: product.cost > 0 ? Math.round(product.cost * 100) / 100 : null,
    taxRate: product.taxType === 'IVA' ? product.taxRate ?? 0 : 0,
    tracksLots: product.tracksLots,
    coldChain: product.medicine?.coldChain ?? false,
    lotNumber: '',
    expirationDate: '',
    rejected: false,
    rejectReason: '',
  };
}

/** Cambia la presentación (unidad, caja…); el costo propuesto se ajusta al factor si viene del costo promedio. */
export function withUnit(line: ReceiptDraftLine, unitId: string): ReceiptDraftLine {
  const before = line.units.find((u) => u.id === line.unitId)?.factor ?? 1;
  const after = line.units.find((u) => u.id === unitId)?.factor ?? 1;
  const proposed = line.baseCost > 0 && Number(line.unitCost) === round2(line.baseCost * before);
  return { ...line, unitId, unitCost: proposed ? round2(line.baseCost * after) : line.unitCost };
}

/** Lote como lo guarda el servidor: mayúsculas y sin espacios de sobra. */
export function normalizeLot(lot: string): string {
  return lot.trim().replace(/\s+/g, ' ').toUpperCase();
}

function num(value: number | string | null): number {
  return value === null || String(value).trim() === '' ? NaN : Number(value);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Subtotal (sin IVA) e IVA de una línea; cero si falta la cantidad o el costo. */
export function lineAmounts(line: ReceiptDraftLine): { net: number; tax: number } {
  const quantity = num(line.quantity);
  const cost = num(line.unitCost);
  if (!(quantity > 0) || !(cost >= 0)) {
    return { net: 0, tax: 0 };
  }
  const net = round2(quantity * round2(cost));
  return { net, tax: round2(net * line.taxRate / 100) };
}

/** Totales de lo aceptado (lo que se debe al proveedor) y valor de lo rechazado. */
export function receiptTotals(lines: readonly ReceiptDraftLine[]): { subtotal: number; tax: number; total: number; rejected: number } {
  let subtotal = 0;
  let tax = 0;
  let rejected = 0;
  for (const line of lines) {
    const amounts = lineAmounts(line);
    if (line.rejected) {
      rejected += amounts.net + amounts.tax;
    } else {
      subtotal += amounts.net;
      tax += amounts.tax;
    }
  }
  return { subtotal: round2(subtotal), tax: round2(tax), total: round2(subtotal + tax), rejected: round2(rejected) };
}

/** Algún producto aceptado va en nevera: hay que anotar la temperatura con que llegó. */
export function needsTemperature(lines: readonly ReceiptDraftLine[]): boolean {
  return lines.some((l) => !l.rejected && l.coldChain);
}

/** Lo que falta o no cuadra en las líneas, o null. {@code today} en formato AAAA-MM-DD. */
export function linesProblem(lines: readonly ReceiptDraftLine[], today: string): string | null {
  if (lines.length === 0) {
    return 'Agrega los productos de la factura.';
  }
  for (const line of lines) {
    if (!(num(line.quantity) > 0)) {
      return `Escribe la cantidad de ${line.name}.`;
    }
    if (!(num(line.unitCost) >= 0)) {
      return `Escribe el costo de ${line.name} (sin IVA).`;
    }
    if (line.rejected) {
      if (!line.rejectReason.trim()) {
        return `Escribe por qué rechazas ${line.name}.`;
      }
      continue;
    }
    const lot = normalizeLot(line.lotNumber);
    if (line.tracksLots && (!lot || !line.expirationDate)) {
      return `${line.name} lleva lote y vencimiento: escríbelos como vienen en el empaque.`;
    }
    if (lot && !LOT_PATTERN.test(lot)) {
      return `El lote de ${line.name} solo admite letras, números, guion, punto o barra (máximo 40).`;
    }
    if (line.expirationDate && line.expirationDate <= today) {
      return `${line.name} está vencido: recházalo (no se puede recibir).`;
    }
  }
  if (lines.every((l) => l.rejected)) {
    return 'No aceptaste ningún producto: si devuelves todo el pedido no hay compra que registrar.';
  }
  return null;
}

/** Temperatura de la nevera: null si está bien o no hace falta. */
export function temperatureProblem(lines: readonly ReceiptDraftLine[], temperature: number | string | null): string | null {
  if (!needsTemperature(lines)) {
    return null;
  }
  const t = num(temperature);
  if (Number.isNaN(t)) {
    return 'Hay productos de nevera: anota la temperatura con que llegaron.';
  }
  if (t < COLD_MIN || t > COLD_MAX) {
    return `Llegaron a ${t} °C, fuera de 2 a 8 °C: rechaza los productos de nevera.`;
  }
  return null;
}

/** Vencimiento cercano (menos de 6 meses): se avisa, pero se puede recibir. */
export function expiresSoon(expiration: string, today: string): boolean {
  if (!expiration || expiration <= today) {
    return false;
  }
  const limit = new Date(today + 'T00:00:00');
  limit.setMonth(limit.getMonth() + 6);
  return expiration < limit.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ factura cargada (decisión 290)

/** Diferencia de costo que se resalta: más de un 25 % frente a la última compra. */
export const COST_CHANGE = 0.25;

/** Línea de la recepción a partir de una línea de la factura ya emparejada con su producto. */
export function invoiceLine(product: Product, draft: InvoiceDraftLine, key: number,
                            by: InvoiceMatchBy | 'MANUAL'): ReceiptDraftLine {
  let line = receiptLine(product, key);
  const unitId = draft.match?.productId === product.id ? draft.match.unitId : null;
  if (unitId && line.units.some((u) => u.id === unitId)) {
    line = { ...line, unitId };
  }
  return {
    ...line,
    quantity: draft.quantity,
    unitCost: draft.unitCost,
    taxRate: draft.taxRate,
    lotNumber: draft.lotNumber ?? '',
    expirationDate: draft.expirationDate ?? '',
    invoice: {
      description: draft.description,
      supplierCode: draft.supplierCode,
      matchedBy: by,
      lastCost: draft.match?.productId === product.id ? draft.match.lastCost : (product.cost > 0 ? product.cost : null),
      unitCode: draft.unitCode,
      packageUnit: draft.packageUnit,
    },
  };
}

/**
 * Lo que hay que revisar de una línea cargada de la factura, o null: el producto se eligió por nombre parecido, la
 * factura viene por caja y la presentación es la unidad, o el costo cambió mucho frente a la última compra.
 */
export function invoiceLineNotice(line: ReceiptDraftLine): string | null {
  const info = line.invoice;
  if (!info || line.rejected) {
    return null;
  }
  const notes: string[] = [];
  if (info.matchedBy === 'NAME') {
    notes.push(`Se eligió por el nombre "${info.description}": confirma que es este producto`);
  }
  const factor = line.units.find((u) => u.id === line.unitId)?.factor ?? 1;
  if (info.packageUnit && factor === 1 && line.units.length > 1) {
    notes.push(`la factura viene por ${unitName(info.unitCode)}: elige la presentación`);
  }
  const cost = num(line.unitCost);
  if (info.lastCost && info.lastCost > 0 && cost >= 0) {
    const perBase = cost / factor;
    const change = (perBase - info.lastCost) / info.lastCost;
    if (Math.abs(change) > COST_CHANGE) {
      notes.push(`el costo ${change > 0 ? 'subió' : 'bajó'} ${Math.round(Math.abs(change) * 100)} % frente a la última `
        + `compra (${formatCop(info.lastCost)} por ${line.units[0]?.code || 'unidad'})`);
    }
  }
  if (notes.length === 0) {
    return null;
  }
  const text = notes.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

function unitName(code: string | null): string {
  const names: Record<string, string> = { BX: 'caja', PK: 'paquete', CS: 'caja', CT: 'cartón', CA: 'lata', DZN: 'docena',
    PA: 'paquete', BG: 'bolsa', BO: 'botella', SET: 'juego', PR: 'par', TU: 'tubo', BL: 'blíster' };
  return (code && names[code.replace(/^X/, '')]) || 'empaque';
}

/**
 * Lo cargado frente al total de la factura: null si cuadra (hasta $100 o el 0,5 %) o si falta emparejar líneas.
 * Lo rechazado cuenta, porque también está en la factura.
 */
export function invoiceTotalNotice(lines: readonly ReceiptDraftLine[], invoiceTotal: number | null,
                                   pendingLines: number): string | null {
  if (invoiceTotal === null || invoiceTotal <= 0 || pendingLines > 0 || lines.length === 0) {
    return null;
  }
  const t = receiptTotals(lines);
  const loaded = round2(t.total + t.rejected);
  const diff = Math.abs(loaded - invoiceTotal);
  if (diff <= Math.max(100, invoiceTotal * 0.005)) {
    return null;
  }
  return `Lo cargado suma ${formatCop(loaded)} y la factura dice ${formatCop(invoiceTotal)}: revisa cantidades, `
    + 'costos e IVA.';
}

export function toLineInputs(lines: readonly ReceiptDraftLine[]): PurchaseLineInput[] {
  return lines.map((l) => ({
    productId: l.productId,
    unitId: l.unitId,
    quantity: Number(l.quantity),
    unitCost: round2(Number(l.unitCost)),
    taxRate: l.taxRate,
    lotNumber: normalizeLot(l.lotNumber) || null,
    expirationDate: l.expirationDate || null,
    status: l.rejected ? 'REJECTED' : 'ACCEPTED',
    rejectReason: l.rejected ? l.rejectReason.trim() : null,
    supplierCode: l.invoice?.supplierCode ?? null,
  }));
}

/** Estado de una compra según lo pagado. */
export function purchaseBadge(p: Pick<PurchaseSummary, 'balance' | 'paid' | 'overdue'>): { key: StatusKey; label: string } {
  if (p.balance <= 0) {
    return { key: 'completed', label: 'Pagada' };
  }
  if (p.overdue) {
    return { key: 'expired', label: 'Vencida' };
  }
  return { key: 'pending', label: p.paid > 0 ? 'Abonada' : 'Por pagar' };
}

/** "Vence hoy", "Vence en 3 días", "Venció hace 2 días". */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) {
    return '';
  }
  const days = Math.round((Date.parse(dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
  if (days === 0) {
    return 'Vence hoy';
  }
  if (days > 0) {
    return days === 1 ? 'Vence mañana' : `Vence en ${days} días`;
  }
  return days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`;
}

/** Número de la recepción: REC-000123. */
export function receiptNumber(n: number): string {
  return 'REC-' + String(n).padStart(6, '0');
}

/** Una línea de la devolución al proveedor (Fase 13-3): cuánto se devuelve, hasta lo recibido menos lo ya devuelto. */
export interface ReturnDraft {
  lineNo: number;
  productName: string;
  unitCode: string | null;
  lotNumber: string | null;
  unitCost: number;
  taxRate: number;
  max: number;
  quantity: number | null;
}

/** Las líneas aceptadas que aún se pueden devolver. */
export function returnDrafts(lines: readonly PurchaseLine[]): ReturnDraft[] {
  return lines
    .filter((l) => l.status === 'ACCEPTED' && l.quantity - (l.returnedQuantity ?? 0) > 0)
    .map((l) => ({
      lineNo: l.lineNo,
      productName: l.productName,
      unitCode: l.unitCode,
      lotNumber: l.lotNumber,
      unitCost: l.unitCost,
      taxRate: l.taxRate,
      max: Math.round((l.quantity - (l.returnedQuantity ?? 0)) * 10_000) / 10_000,
      quantity: null,
    }));
}

/** Valor que se descuenta al proveedor: costo de la factura más IVA, como el servidor. */
export function returnTotal(drafts: readonly ReturnDraft[]): number {
  return round2(drafts.reduce((sum, d) => {
    const q = Number(d.quantity);
    if (!(q > 0)) {
      return sum;
    }
    const net = round2(q * d.unitCost);
    return sum + net + round2(net * d.taxRate / 100);
  }, 0));
}

export function returnProblem(drafts: readonly ReturnDraft[], reason: string): string | null {
  const chosen = drafts.filter((d) => d.quantity !== null && String(d.quantity) !== '' && Number(d.quantity) !== 0);
  if (chosen.length === 0) {
    return 'Escribe cuánto devuelves de al menos un producto.';
  }
  for (const d of chosen) {
    const q = Number(d.quantity);
    if (!(q > 0)) {
      return `Revisa la cantidad de ${d.productName}.`;
    }
    if (q > d.max) {
      return `De ${d.productName} solo puedes devolver ${d.max}.`;
    }
  }
  return reason.trim() ? null : 'Escribe el motivo de la devolución.';
}
