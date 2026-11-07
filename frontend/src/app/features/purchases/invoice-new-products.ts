import { InvoiceNewProduct } from '../../core/api/catalog.api';
import { SizeScale, Tax } from '../../core/api/api.models';
import { InvoiceDraftLine } from '../../core/api/purchases.api';
import { priceFor } from '../products/catalog-text';

/** Una línea de la factura que se va a crear (decisión 301), mientras la persona la revisa. */
export interface NewProductRow {
  lineNo: number;
  selected: boolean;
  description: string;
  quantity: number;
  barcode: string | null;
  supplierCode: string | null;
  sku: string;
  name: string;
  category: string;
  unitCode: string;
  taxCode: string;
  cost: number;
  price: number;
  /** Con tallas: la escala elegida, el color y cuántos llegaron de cada talla (por etiqueta). */
  withSizes: boolean;
  sizeScaleId: string;
  color: string;
  sizeQty: Record<string, number>;
}

const UNITS: Record<string, string> = {
  UN: 'UND', UND: 'UND', UNIDAD: 'UND', U: 'UND', PAR: 'UND', PARES: 'UND', KG: 'KG', KILO: 'KG', LB: 'LB',
  LT: 'LT', L: 'LT', LITRO: 'LT', CJ: 'CJ', CAJA: 'CJ', G: 'G', GR: 'G',
};

/** La escala que tiene todas las tallas leídas (la primera activa si no hay tallas o ninguna las tiene todas). */
export function scaleFor(sizes: string[], scales: SizeScale[]): SizeScale | null {
  const active = scales.filter((s) => s.active);
  const wanted = sizes.map((s) => s.trim().toUpperCase());
  return active.find((s) => wanted.length > 0
    && wanted.every((w) => s.sizes.some((x) => x.label.toUpperCase() === w))) ?? active[0] ?? null;
}

export function taxFor(rate: number, taxes: Tax[]): string {
  const active = taxes.filter((t) => t.active);
  return (active.find((t) => t.rate === rate && (rate > 0 || t.type !== 'EXCLUDED'))
    ?? active.find((t) => t.rate === 0) ?? active[0])?.code ?? '';
}

/** SKU de un producto nuevo: el código del proveedor si sirve; si no, letras del nombre y un número. */
export function skuFor(name: string, supplierCode: string | null, taken: Set<string>): string {
  const code = (supplierCode ?? '').trim().toUpperCase();
  if (/^[A-Z0-9][A-Z0-9.-]{0,38}$/.test(code) && !taken.has(code)) {
    taken.add(code);
    return code;
  }
  const plain = name.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
  const prefix = plain.split(/\s+/).filter(Boolean).map((w) => w.slice(0, 3)).join('').slice(0, 6) || 'PROD';
  for (let n = 1; n < 1000; n++) {
    const candidate = `${prefix}-${String(n).padStart(2, '0')}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  return prefix;
}

export function toRows(lines: InvoiceDraftLine[], ctx: { taxes: Tax[]; scales: SizeScale[]; margin: number;
  pricesIncludeTax: boolean; variants: boolean }): NewProductRow[] {
  const taken = new Set<string>();
  return lines.map((l) => {
    const taxCode = taxFor(l.taxRate, ctx.taxes);
    const rate = ctx.taxes.find((t) => t.code === taxCode)?.rate ?? 0;
    const withSizes = ctx.variants && l.sizes.length > 0;
    const scale = scaleFor(l.sizes.map((s) => s.size), ctx.scales);
    const sizeQty: Record<string, number> = {};
    l.sizes.forEach((s) => (sizeQty[s.size.trim().toUpperCase()] = s.quantity));
    return {
      lineNo: l.lineNo,
      selected: true,
      description: l.description,
      quantity: l.quantity,
      barcode: l.barcode,
      supplierCode: l.supplierCode,
      sku: skuFor(l.description, l.supplierCode, taken),
      name: l.description,
      category: '',
      unitCode: UNITS[(l.unitCode ?? '').toUpperCase()] ?? 'UND',
      taxCode,
      cost: l.unitCost,
      price: l.unitCost > 0 ? priceFor(l.unitCost, ctx.margin, rate, ctx.pricesIncludeTax) : 0,
      withSizes,
      sizeScaleId: scale?.id ?? '',
      color: l.color ?? '',
      sizeQty,
    };
  });
}

/** Suma de lo repartido por tallas en la escala elegida. */
export function sizesTotal(row: NewProductRow, scales: SizeScale[]): number {
  const scale = scales.find((s) => s.id === row.sizeScaleId);
  return (scale?.sizes ?? []).reduce((sum, s) => sum + (Number(row.sizeQty[s.label.toUpperCase()]) || 0), 0);
}

/** Qué le falta a una fila marcada; null si está lista. Repartir distinto a la factura solo es un aviso. */
export function rowProblem(row: NewProductRow, scales: SizeScale[]): string | null {
  if (!row.selected) {
    return null;
  }
  if (!row.name.trim()) {
    return 'Falta el nombre.';
  }
  if (!row.sku.trim()) {
    return row.withSizes ? 'Falta el prefijo.' : 'Falta el SKU.';
  }
  if (!(row.price > 0)) {
    return 'Falta el precio.';
  }
  if (!(row.cost >= 0)) {
    return 'El costo no es válido.';
  }
  if (row.withSizes) {
    if (!row.sizeScaleId) {
      return 'Elige la escala de tallas.';
    }
    if (sizesTotal(row, scales) <= 0) {
      return 'Reparte las cantidades por talla.';
    }
  }
  return null;
}

export function sizesNotice(row: NewProductRow, scales: SizeScale[]): string | null {
  if (!row.withSizes) {
    return null;
  }
  const total = sizesTotal(row, scales);
  return total > 0 && total !== row.quantity
    ? `Repartiste ${total} y la factura dice ${row.quantity}: se recibe lo repartido.` : null;
}

export function toItems(rows: NewProductRow[], scales: SizeScale[]): InvoiceNewProduct[] {
  return rows.filter((r) => r.selected).map((r) => {
    const scale = scales.find((s) => s.id === r.sizeScaleId);
    return {
      lineNo: r.lineNo,
      sku: r.sku.trim(),
      name: r.name.trim(),
      category: r.category.trim() || null,
      unitCode: r.withSizes ? null : r.unitCode,
      taxCode: r.taxCode,
      cost: r.cost,
      price: r.price,
      barcode: r.withSizes ? null : r.barcode,
      sizeScaleId: r.withSizes ? r.sizeScaleId : null,
      color: r.withSizes && r.color.trim() ? r.color.trim() : null,
      sizes: !r.withSizes || !scale ? [] : scale.sizes
        .map((s) => ({ size: s.label, quantity: Number(r.sizeQty[s.label.toUpperCase()]) || 0 }))
        .filter((s) => s.quantity > 0),
    };
  });
}
