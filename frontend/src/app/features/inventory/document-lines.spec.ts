import { Product } from '../../core/api/api.models';
import { addScan, baseQuantity, draftLine, linesProblem, toLineInputs } from './document-lines';

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
});
