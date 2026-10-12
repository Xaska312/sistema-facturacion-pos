import { Direction, InventoryDocumentType, InventoryLineInput, Product, ProductVariant } from '../../core/api/api.models';

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

/** Línea de una talla agregada desde la cuadrícula talla × color (fase 8d): las variantes solo tienen unidad base. */
export function variantLine(variant: ProductVariant, quantity: number,
                            options: { direction: Direction; unitCost: number | null; currentQuantity: number | null })
  : DraftLine {
  return {
    productId: variant.productId,
    sku: variant.sku,
    name: variant.name,
    units: [{ id: variant.baseUnitId, code: variant.baseUnitCode, factor: 1 }],
    unitId: variant.baseUnitId,
    quantity,
    direction: options.direction,
    unitCost: options.unitCost,
    currentQuantity: options.currentQuantity,
    baseUnitCode: variant.baseUnitCode,
  };
}

/**
 * Aplica la cuadrícula de un modelo a la lista: las tallas de {@code variantIds} quedan como dice la cuadrícula (las que
 * ya estaban se actualizan en su lugar conservando la existencia con la que se empezó a contar, las nuevas van al final y
 * las que se dejaron vacías salen de la lista). Las líneas de otros productos no cambian.
 */
export function mergeGridLines(lines: DraftLine[], variantIds: readonly string[], grid: DraftLine[]): DraftLine[] {
  const ofModel = new Set(variantIds);
  const fromGrid = new Map(grid.map((l) => [l.productId, l] as const));
  const result: DraftLine[] = [];
  for (const line of lines) {
    const updated = fromGrid.get(line.productId);
    if (!ofModel.has(line.productId)) {
      result.push(line);
    } else if (updated) {
      // En el conteo se conserva la existencia de cuando se empezó a contar esa talla (INV-2).
      result.push({ ...updated, currentQuantity: line.currentQuantity ?? updated.currentQuantity });
      fromGrid.delete(line.productId);
    }
  }
  return [...result, ...fromGrid.values()];
}

/** Cantidad de la línea en unidad base. */
export function baseQuantity(line: DraftLine): number | null {
  if (line.quantity === null || String(line.quantity) === '') {
    return null;
  }
  const factor = line.units.find((u) => u.id === line.unitId)?.factor ?? 1;
  return Number(line.quantity) * factor;
}

/**
 * Suma 1 a la línea por una nueva lectura del lector en {@code unitId} (QA UI-6). Si la lectura es de otra unidad que
 * la de la línea (p. ej. la caja cuando la línea va en unidades), devuelve null: no se suma para no mezclar unidades.
 */
export function addScan(line: DraftLine, unitId: string | null): DraftLine | null {
  const unit = line.units.some((u) => u.id === unitId) ? unitId : line.units[0]?.id;
  const current = line.quantity === null || String(line.quantity) === '' ? 0 : Number(line.quantity);
  if (unit !== line.unitId || Number.isNaN(current)) {
    return null;
  }
  return { ...line, quantity: current + 1 };
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
    if (type === 'COUNT') {
      // Lo que había al empezar a contar: si se vende durante el conteo, el ajuste no "inventa" existencias (INV-2).
      input.expectedQuantity = l.currentQuantity;
    }
    return input;
  });
}
