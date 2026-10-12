import { Product, ProductVariant } from '../../core/api/api.models';
import { addScan, baseQuantity, draftLine, linesProblem, mergeGridLines, toLineInputs, variantLine } from './document-lines';

const product: Product = {
  id: 'p1', sku: 'GAS', name: 'Gaseosa', description: null, categoryId: null, categoryName: null,
  baseUnitId: 'und', baseUnitCode: 'UND', taxId: 't', taxCode: 'IVA19', taxType: 'IVA', taxRate: 19,
  cost: 1000, costLocked: false, salePrice: 2000, trackInventory: true, tracksLots: false, active: true,
  conversions: [{ unitId: 'cj', unitCode: 'CJ', factor: 12, salePrice: null, effectivePrice: 24000 }],
  barcodes: [], listPrices: [],
};

describe('document-lines', () => {
  it('ofrece la unidad base y las presentaciones, y respeta la unidad del código escaneado', () => {
    const line = draftLine(product, 'cj');
    expect(line.units.map((u) => u.code)).toEqual(['UND', 'CJ']);
    expect(line.unitId).toBe('cj');
    expect(draftLine(product, 'otra').unitId).toBe('und');
  });

  it('convierte a unidad base', () => {
    const line = { ...draftLine(product, 'cj'), quantity: 2 };
    expect(baseQuantity(line)).toBe(24);
  });

  it('valida cantidades y costos según el tipo', () => {
    const line = { ...draftLine(product, null), quantity: 0 };
    expect(linesProblem('ADJUSTMENT', [line])).toContain('cantidad');
    expect(linesProblem('COUNT', [line])).toBeNull();
    expect(linesProblem('INITIAL', [{ ...line, quantity: 5 }])).toContain('costo');
    expect(linesProblem('INITIAL', [])).toContain('al menos');
  });

  it('solo envía costo en entradas de ajuste y saldo inicial', () => {
    const out = { ...draftLine(product, null), quantity: 1, direction: 'OUT' as const, unitCost: 500 };
    expect(toLineInputs('ADJUSTMENT', [out])[0].unitCost).toBeNull();
    expect(toLineInputs('TRANSFER', [out])[0].unitCost).toBeUndefined();
    expect(toLineInputs('INITIAL', [out])[0].unitCost).toBe(500);
  });

  it('en conteos envía la existencia que había al empezar a contar (QA INV-2)', () => {
    const counted = { ...draftLine(product, null), quantity: 45, currentQuantity: 50 };
    expect(toLineInputs('COUNT', [counted])[0].expectedQuantity).toBe(50);
    expect(toLineInputs('ADJUSTMENT', [counted])[0].expectedQuantity).toBeUndefined();
  });

  it('cada lectura del lector suma 1 en la misma unidad, sin mezclar unidades (QA UI-6)', () => {
    const line = { ...draftLine(product, 'cj'), quantity: 1 };
    expect(addScan(line, 'cj')?.quantity).toBe(2);
    expect(addScan({ ...line, quantity: null }, 'cj')?.quantity).toBe(1);
    expect(addScan(line, 'und')).toBeNull();
    const units = { ...draftLine(product, null), quantity: 3 };
    expect(addScan(units, 'desconocida')?.quantity).toBe(4);
  });

  describe('cuadrícula de tallas (fase 8d)', () => {
    const variant = (id: string, size: string): ProductVariant => ({
      productId: id, sku: `RUN-${size}`, name: `Tenis T${size}`, size, color: null, barcode: null,
      baseUnitId: 'und', baseUnitCode: 'UND', active: true,
    });
    const options = { direction: 'IN' as const, unitCost: 50000, currentQuantity: 2 };

    it('arma la línea de una talla en unidad base', () => {
      const line = variantLine(variant('v38', '38'), 3, options);
      expect(line.units).toEqual([{ id: 'und', code: 'UND', factor: 1 }]);
      expect(line.unitId).toBe('und');
      expect([line.quantity, line.unitCost, line.currentQuantity, line.name]).toEqual([3, 50000, 2, 'Tenis T38']);
    });

    it('actualiza en su lugar, agrega al final y quita las tallas vacías; no toca otros productos', () => {
      const other = { ...draftLine(product, null), quantity: 1 };
      const old38 = variantLine(variant('v38', '38'), 1, options);
      const old39 = variantLine(variant('v39', '39'), 1, options);
      const merged = mergeGridLines([old38, other, old39], ['v38', 'v39', 'v40'], [
        variantLine(variant('v40', '40'), 4, options),
        variantLine(variant('v38', '38'), 5, options),
      ]);
      expect(merged.map((l) => [l.productId, l.quantity])).toEqual([['v38', 5], ['p1', 1], ['v40', 4]]);
    });

    it('en el conteo conserva la existencia con la que se empezó a contar la talla', () => {
      const old38 = { ...variantLine(variant('v38', '38'), 1, options), currentQuantity: 7 };
      const merged = mergeGridLines([old38], ['v38'], [variantLine(variant('v38', '38'), 6, { ...options, currentQuantity: 5 })]);
      expect([merged[0].quantity, merged[0].currentQuantity]).toEqual([6, 7]);
    });
  });
});
