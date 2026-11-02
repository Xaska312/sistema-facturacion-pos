import { Product } from '../../core/api/api.models';
import {
  ReceiptDraftLine,
  dueLabel,
  expiresSoon,
  linesProblem,
  normalizeLot,
  purchaseBadge,
  receiptLine,
  receiptNumber,
  receiptTotals,
  temperatureProblem,
  toLineInputs,
  withUnit,
} from './purchase-text';

const TODAY = '2026-11-02';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'p1', sku: 'AMOX', name: 'Amoxicilina 500', description: null, categoryId: null, categoryName: null,
    baseUnitId: 'und', baseUnitCode: 'UND', taxId: 't', taxCode: 'IVA19', taxType: 'IVA', taxRate: 19, cost: 1000,
    costLocked: true, salePrice: 2000, trackInventory: true, tracksLots: true, active: true,
    conversions: [{ unitId: 'cj', unitCode: 'CJ', factor: 10 } as Product['conversions'][number]], barcodes: [],
    listPrices: [], medicine: null, ...over,
  };
}

function line(over: Partial<ReceiptDraftLine> = {}): ReceiptDraftLine {
  return { ...receiptLine(product(), 1), quantity: 10, lotNumber: 'L-1', expirationDate: '2028-01-31', ...over };
}

describe('recepción de compras (Fase 13-2, decisión 280)', () => {
  it('la línea parte del costo promedio y el IVA del producto; excluido va sin IVA', () => {
    const l = receiptLine(product(), 7);
    expect(l.unitCost).toBe(1000);
    expect(l.taxRate).toBe(19);
    expect(l.units.map((u) => u.code)).toEqual(['UND', 'CJ']);
    expect(receiptLine(product({ taxType: 'EXCLUDED', taxRate: 0 }), 8).taxRate).toBe(0);
    expect(receiptLine(product({ medicine: { kind: 'MEDICINE', saleCondition: 'PRESCRIPTION', activeIngredients: null,
      antibiotic: false, coldChain: true, unitSale: false } }), 9).coldChain).toBeTrue();
  });

  it('al pasar a caja el costo propuesto se multiplica; uno escrito a mano no se toca', () => {
    expect(withUnit(line(), 'cj').unitCost).toBe(10000);
    expect(withUnit(line({ unitCost: 900 }), 'cj').unitCost).toBe(900);
  });

  it('totales: lo aceptado con IVA y lo rechazado aparte', () => {
    const totals = receiptTotals([line({ quantity: 5, unitCost: 2000 }), line({ quantity: 2, rejected: true })]);
    expect(totals).toEqual({ subtotal: 10000, tax: 1900, total: 11900, rejected: 2380 });
  });

  it('pide lote y vencimiento, no deja recibir vencidos y exige motivo al rechazar', () => {
    expect(linesProblem([], TODAY)).toContain('Agrega');
    expect(linesProblem([line({ lotNumber: '' })], TODAY)).toContain('lote y vencimiento');
    expect(linesProblem([line({ expirationDate: TODAY })], TODAY)).toContain('vencido');
    expect(linesProblem([line({ lotNumber: 'L#1' })], TODAY)).toContain('lote');
    expect(linesProblem([line({ rejected: true })], TODAY)).toContain('por qué');
    expect(linesProblem([line({ rejected: true, rejectReason: 'Roto' })], TODAY)).toContain('ningún producto');
    expect(linesProblem([line(), line({ rejected: true, rejectReason: 'Roto', lotNumber: '' })], TODAY)).toBeNull();
    expect(linesProblem([line({ tracksLots: false, lotNumber: '', expirationDate: '' })], TODAY)).toBeNull();
  });

  it('nevera: temperatura obligatoria y entre 2 y 8 °C', () => {
    const cold = [line({ coldChain: true })];
    expect(temperatureProblem([line()], null)).toBeNull();
    expect(temperatureProblem(cold, null)).toContain('temperatura');
    expect(temperatureProblem(cold, 9)).toContain('fuera de 2 a 8');
    expect(temperatureProblem(cold, '4.5')).toBeNull();
    expect(temperatureProblem([line({ coldChain: true, rejected: true })], null)).toBeNull();
  });

  it('envía el lote en mayúsculas y el motivo solo si se rechaza', () => {
    const [accepted, rejected] = toLineInputs([line({ lotNumber: ' ab  12 ' }),
      line({ rejected: true, rejectReason: ' Caja rota ' })]);
    expect(accepted.lotNumber).toBe('AB 12');
    expect(accepted.status).toBe('ACCEPTED');
    expect(accepted.rejectReason).toBeNull();
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectReason).toBe('Caja rota');
    expect(normalizeLot('x-1')).toBe('X-1');
  });

  it('avisa lo que vence en menos de 6 meses', () => {
    expect(expiresSoon('2027-03-01', TODAY)).toBeTrue();
    expect(expiresSoon('2027-12-01', TODAY)).toBeFalse();
    expect(expiresSoon(TODAY, TODAY)).toBeFalse();
  });

  it('estado según lo pagado y texto del vencimiento', () => {
    expect(purchaseBadge({ balance: 0, paid: 100, overdue: false }).label).toBe('Pagada');
    expect(purchaseBadge({ balance: 50, paid: 50, overdue: false }).label).toBe('Abonada');
    expect(purchaseBadge({ balance: 50, paid: 0, overdue: true }).key).toBe('expired');
    expect(dueLabel('2026-11-02', TODAY)).toBe('Vence hoy');
    expect(dueLabel('2026-11-05', TODAY)).toBe('Vence en 3 días');
    expect(dueLabel('2026-11-01', TODAY)).toBe('Venció ayer');
    expect(dueLabel(null, TODAY)).toBe('');
    expect(receiptNumber(42)).toBe('REC-000042');
  });
});
