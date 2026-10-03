import { Direction, InventoryDocumentType, InventoryLineInput, Product } from '../../core/api/api.models';

/** Línea en edición del documento de inventario. */
export interface DraftLine {
  productId: string;
  sku: string;
  name: string;
  /** Unidades posibles: base y presentaciones. */
  units: { id: string; code: string; factor: number }[];
  unitId: string;
  quantity: number | null;
  direction: Direction;
  unitCost: number | null;
  /** Existencia actual en unidad base (conteos). */
  currentQuantity: number | null;
  baseUnitCode: string;
}

export function draftLine(product: Product, unitId: string | null): DraftLine {
  const units = [
    { id: product.baseUnitId, code: product.baseUnitCode ?? '', factor: 1 },
    ...product.conversions.map((c) => ({ id: c.unitId, code: c.unitCode ?? '', factor: c.factor })),
  ];
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    units,
    unitId: unitId && units.some((u) => u.id === unitId) ? unitId : product.baseUnitId,
    quantity: null,
    direction: 'IN',
    unitCost: null,
    currentQuantity: null,
    baseUnitCode: product.baseUnitCode ?? '',
  };
}

/** Cantidad de la línea en unidad base. */
export function baseQuantity(line: DraftLine): number | null {
  if (line.quantity === null || String(line.quantity) === '') {
    return null;
  }
  const factor = line.units.find((u) => u.id === line.unitId)?.factor ?? 1;
  return Number(line.quantity) * factor;
}

/** Validación en el cliente antes de enviar (el backend aplica todas las reglas). */
export function linesProblem(type: InventoryDocumentType, lines: DraftLine[]): string | null {
  if (lines.length === 0) {
    return 'Agrega al menos un producto.';
  }
  for (const line of lines) {
    const q = line.quantity === null || String(line.quantity) === '' ? NaN : Number(line.quantity);
    if (Number.isNaN(q) || q < 0 || (q === 0 && type !== 'COUNT')) {
      return `Revisa la cantidad de ${line.name}.`;
    }
    if (type === 'INITIAL' && (line.unitCost === null || String(line.unitCost) === '' || Number(line.unitCost) < 0)) {
      return `Indica el costo de ${line.name}.`;
    }
  }
  return null;
}

export function toLineInputs(type: InventoryDocumentType, lines: DraftLine[]): InventoryLineInput[] {
  return lines.map((l) => {
    const input: InventoryLineInput = { productId: l.productId, unitId: l.unitId, quantity: Number(l.quantity) };
    const hasCost = l.unitCost !== null && String(l.unitCost) !== '';
    if (type === 'ADJUSTMENT') {
      input.direction = l.direction;
      input.unitCost = l.direction === 'IN' && hasCost ? Number(l.unitCost) : null;
    }
    if (type === 'INITIAL') {
      input.unitCost = hasCost ? Number(l.unitCost) : null;
    }
    return input;
  });
}
