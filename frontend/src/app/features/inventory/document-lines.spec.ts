import { Product } from '../../core/api/api.models';
import { baseQuantity, draftLine, linesProblem, toLineInputs } from './document-lines';

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
});
