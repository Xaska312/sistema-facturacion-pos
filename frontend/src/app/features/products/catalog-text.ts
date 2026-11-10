import { CatalogAction, CatalogConfirmed, CatalogDraft, CatalogMatch, CatalogOption, CatalogRow } from '../../core/api/ai.api';

/** Fila de "Cargar con Aska" mientras la persona la revisa (decisión 300). */
export interface CatalogEdit {
  rowId: number;
  selected: boolean;
  action: CatalogAction;
  match: CatalogMatch | null;
  description: string;
  supplierCode: string | null;
  barcode: string | null;
  listCost: number;
  taxRate: number | null;
  sku: string;
  name: string;
  category: string;
  unitCode: string;
  taxCode: string;
  cost: number;
  /** Nulo mientras no lo escriban (decisión 313: listas y cuadernos sin precios). */
  price: number | null;
  /** Modo inventario: cantidad para el saldo inicial (null = no se carga). */
  quantity: number | null;
  stockNote: string | null;
}

export function toEdits(draft: CatalogDraft): CatalogEdit[] {
  return draft.rows.map((r: CatalogRow) => ({
    rowId: r.rowId,
    // Lo que no cambia queda sin marcar (salvo que traiga cantidad para el saldo inicial); lo parecido solo por el
    // nombre se marca, pero se avisa que hay que revisarlo.
    selected: r.proposal.action !== 'SKIP' || (r.quantity ?? 0) > 0,
    action: r.proposal.action,
    match: r.match,
    description: r.description,
    supplierCode: r.supplierCode,
    barcode: r.barcode,
    listCost: r.listCost,
    taxRate: r.taxRate,
    sku: r.proposal.sku,
    name: r.proposal.name,
    category: r.proposal.category ?? '',
    unitCode: r.proposal.unitCode,
    taxCode: r.proposal.taxCode,
    cost: r.proposal.cost,
    price: r.proposal.price,
    quantity: r.quantity,
    stockNote: r.stockNote,
  }));
}

function rateOf(taxCode: string, taxes: CatalogOption[]): number {
  return taxes.find((t) => t.code === taxCode)?.rate ?? 0;
}

/** Hacia arriba a los $100. */
export function roundUpHundred(value: number): number {
  return Math.ceil(Math.round(value * 100) / 100 / 100) * 100;
}

/** Precio con ese margen sobre el precio sin IVA; con IVA si el negocio vende así. Igual que el servidor. */
export function priceFor(cost: number, marginPercent: number, taxRate: number, includesTax: boolean): number {
  const net = cost / (1 - marginPercent / 100);
  return roundUpHundred(includesTax && taxRate > 0 ? net * (1 + taxRate / 100) : net);
}

/** Margen sobre el precio sin IVA (%), o null si no se puede calcular. */
export function marginOf(edit: Pick<CatalogEdit, 'cost' | 'price' | 'taxCode'>, taxes: CatalogOption[],
                         includesTax: boolean): number | null {
  const price = edit.price ?? 0;
  if (!(price > 0) || !(edit.cost >= 0)) {
    return null;
  }
  const rate = rateOf(edit.taxCode, taxes);
  const net = includesTax && rate > 0 ? price / (1 + rate / 100) : price;
  return Math.round(((net - edit.cost) / net) * 1000) / 10;
}

/** "No es ese producto": la fila pasa a crearse con el margen del negocio. */
export function asNew(edit: CatalogEdit, draft: CatalogDraft): CatalogEdit {
  const taxCode = taxCodeFor(edit.taxRate ?? 0, draft.taxes);
  const sku = (edit.supplierCode ?? '').trim().toUpperCase();
  return {
    ...edit,
    selected: true,
    action: 'CREATE',
    match: null,
    sku: /^[A-Z0-9][A-Z0-9.-]{0,38}$/.test(sku) ? sku : '',
    name: edit.description,
    category: '',
    unitCode: draft.units.some((u) => u.code === 'UND') ? 'UND' : draft.units[0]?.code ?? '',
    taxCode,
    price: edit.cost > 0 ? priceFor(edit.cost, draft.margin, rateOf(taxCode, draft.taxes), draft.pricesIncludeTax)
      : null,
  };
}

export function taxCodeFor(rate: number, taxes: CatalogOption[]): string {
  const exact = taxes.find((t) => t.rate === rate && (rate > 0 || t.code !== 'EXCLUIDO'));
  return exact?.code ?? taxes.find((t) => t.rate === 0)?.code ?? taxes[0]?.code ?? '';
}

/** Qué le falta a una fila marcada para poder guardarse; null si está lista. */
export function rowProblem(edit: CatalogEdit): string | null {
  if (!edit.selected) {
    return null;
  }
  if (edit.action === 'CREATE') {
    if (!edit.sku.trim()) {
      return 'Falta el SKU.';
    }
    if (!edit.name.trim()) {
      return 'Falta el nombre.';
    }
  }
  if (edit.price === null || !Number.isFinite(edit.price) || edit.price < 0) {
    return 'Falta el precio: escríbelo (o 0 si aún no lo sabes).';
  }
  if (!(edit.cost >= 0)) {
    return 'El costo no es válido.';
  }
  if (edit.price > 0 && edit.cost > edit.price) {
    return 'El costo es mayor que el precio.';
  }
  if (edit.quantity !== null && !(edit.quantity >= 0)) {
    return 'La cantidad no es válida.';
  }
  return null;
}

export function toConfirmed(edits: CatalogEdit[]): CatalogConfirmed[] {
  return edits.filter((e) => e.selected).map((e) => ({
    productId: e.match?.productId ?? null,
    sku: e.sku.trim(),
    name: e.name.trim(),
    barcode: e.barcode,
    category: e.category.trim() || null,
    unitCode: e.unitCode,
    taxCode: e.taxCode,
    cost: e.cost,
    price: e.price ?? 0,
    supplierCode: e.supplierCode,
    quantity: e.quantity !== null && e.quantity > 0 ? e.quantity : null,
  }));
}

export function matchLabel(match: CatalogMatch): string {
  switch (match.by) {
    case 'MEMORY':
      return 'Ya lo conocía de este proveedor';
    case 'BARCODE':
      return 'Mismo código de barras';
    case 'SKU':
      return 'Mismo SKU';
    default:
      return 'Nombre parecido: revisa que sea el mismo';
  }
}
