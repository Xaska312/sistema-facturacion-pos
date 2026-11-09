import { CatalogDraft } from '../../core/api/ai.api';
import { asNew, marginOf, priceFor, roundUpHundred, rowProblem, taxCodeFor, toConfirmed, toEdits } from './catalog-text';

const taxes = [
  { code: 'IVA19', name: 'IVA 19 %', rate: 19 },
  { code: 'IVA5', name: 'IVA 5 %', rate: 5 },
  { code: 'EXCLUIDO', name: 'Excluido', rate: 0 },
  { code: 'EXENTO', name: 'Exento', rate: 0 },
];

function draft(): CatalogDraft {
  return {
    rows: [
      {
        rowId: 1, description: 'Arroz Diana 1 kg', supplierCode: null, barcode: '7702511000014', listCost: 2400, taxRate: 19,
        match: { productId: 'p1', sku: 'ARROZ-1', name: 'Arroz Diana 1 kg', by: 'NAME', currentCost: 2000,
          currentPrice: 3570, costLocked: false },
        proposal: { action: 'UPDATE', sku: 'ARROZ-1', name: 'Arroz Diana 1 kg', category: 'Granos', unitCode: 'UND',
          taxCode: 'IVA19', cost: 2400, price: 4300, marginPercent: 33.3 },
        quantity: null, stockNote: null,
      },
      {
        rowId: 2, description: 'Sal 500 g', supplierCode: 'S-1', barcode: null, listCost: 800, taxRate: 0, match: null,
        proposal: { action: 'SKIP', sku: 'S-1', name: 'Sal 500 g', category: null, unitCode: 'UND', taxCode: 'EXENTO',
          cost: 800, price: 1200, marginPercent: 30 },
        quantity: null, stockNote: null,
      },
    ],
    units: [{ code: 'KG', name: 'Kilo', rate: null }, { code: 'UND', name: 'Unidad', rate: null }],
    taxes, categories: ['Granos'], pricesIncludeTax: true, margin: 30, warnings: [],
    usage: { available: true, limit: 20, used: 1 }, inventory: false, branchId: null,
  };
}

describe('catalog-text (Cargar con Aska)', () => {
  it('calcula el precio como el servidor y redondea hacia arriba a $100', () => {
    expect(priceFor(1000, 30, 19, true)).toBe(1700);
    expect(priceFor(1000, 30, 19, false)).toBe(1500);
    expect(priceFor(4000, 30, 5, true)).toBe(6000);
    expect(roundUpHundred(4281.86)).toBe(4300);
  });

  it('muestra el margen sobre el precio sin IVA', () => {
    expect(marginOf({ cost: 2000, price: 3570, taxCode: 'IVA19' }, taxes, true)).toBe(33.3);
    expect(marginOf({ cost: 2000, price: 0, taxCode: 'IVA19' }, taxes, true)).toBeNull();
  });

  it('deja sin marcar lo que no cambia y pasa a nuevo lo que no era el mismo producto', () => {
    const d = draft();
    const edits = toEdits(d);
    expect(edits.map((e) => e.selected)).toEqual([true, false]);
    const fresh = asNew(edits[0], d);
    expect(fresh.action).toBe('CREATE');
    expect(fresh.match).toBeNull();
    expect(fresh.sku).toBe('');
    expect(rowProblem(fresh)).toBe('Falta el SKU.');
    expect(fresh.price).toBe(priceFor(2400, 30, 19, true));
    expect(toConfirmed([{ ...fresh, sku: 'ARR-2' }])[0]).toEqual(jasmine.objectContaining({ productId: null, sku: 'ARR-2' }));
  });

  it('elige el impuesto por la tarifa sin confundir exento con excluido', () => {
    expect(taxCodeFor(5, taxes)).toBe('IVA5');
    expect(taxCodeFor(0, taxes)).toBe('EXENTO');
  });

  it('avisa cuando el costo supera el precio', () => {
    const e = { ...toEdits(draft())[0], cost: 5000, price: 4300 };
    expect(rowProblem(e)).toBe('El costo es mayor que el precio.');
  });

  it('modo inventario: marca lo que trae cantidad aunque no cambie y la manda en el saldo inicial', () => {
    const d = draft();
    d.rows[1] = { ...d.rows[1], quantity: 12 };
    const edits = toEdits(d);
    expect(edits[1].selected).toBeTrue();
    expect(toConfirmed(edits)[1].quantity).toBe(12);
    expect(rowProblem({ ...edits[1], quantity: -1 })).toBe('La cantidad no es válida.');
  });
});
