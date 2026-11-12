import { CashSession, PosConfig } from '../../core/api/api.models';
import { offlineLines } from '../../shared/receipt/doc-header';
import { offlineSale } from './offline-sale';
import { CartLine } from './sale-math';

const CONFIG = { pricesIncludeTax: true, maxDiscountPercent: 0, allowNegativeStock: false, currency: 'COP',
  receiptFooter: 'Gracias', businessName: 'Tienda Doima', finalConsumerId: 'cf', receiptHeader: 'NIT: 900' } as PosConfig;
const SESSION = { id: 's1', cashRegisterId: 'r1', registerCode: 'CAJA-1', registerName: 'Caja 1', branchId: 'b1',
  branchName: 'Principal' } as CashSession;
const LINES: CartLine[] = [
  { key: 'a', productId: 'p1', sku: 'GAS', name: 'Gaseosa', unitId: 'und', unitCode: 'UND', quantity: 2, unitPrice: 2500,
    discountPercent: 0, taxRate: 19, trackInventory: true },
  { key: 'b', productId: 'p2', sku: 'PAN', name: 'Pan', unitId: 'und', unitCode: 'UND', quantity: 1, unitPrice: 1000,
    discountPercent: 0, taxRate: 0, trackInventory: false },
];

describe('Tiquete de una venta sin conexión (decisión 332)', () => {
  it('lleva el número provisional, la cuenta del carrito, los impuestos y el cambio del efectivo', () => {
    const sale = offlineSale({
      id: 'offline:k1', number: 'CAJA-1-SC0003', soldAt: '2026-11-12T20:00:00Z', input: { customerId: null, items: [],
        payments: [], expectedTotal: 6000, notes: null },
      lines: LINES,
      payments: [{ methodId: 'cash', affectsCash: true, amount: 10000, reference: '' }],
      methods: [{ id: 'cash', code: 'CASH', name: 'Efectivo', affectsCash: true, requiresReference: false }],
      config: CONFIG, session: SESSION, userId: 'u1', userName: 'Ana',
      taxOf: (l) => ({ taxId: l.taxRate > 0 ? 'iva19' : 'exento', taxType: 'IVA' }),
    });
    expect(sale.documentNumber).toBe('CAJA-1-SC0003');
    expect(sale.total).toBe(6000);
    expect(sale.changeAmount).toBe(4000);
    expect(sale.payments[0]).toEqual(jasmine.objectContaining({ tendered: 10000, amount: 6000, methodName: 'Efectivo' }));
    expect(sale.taxes.length).toBe(2);
    expect(sale.taxTotal).toBe(798.32);
    expect(sale.receipt.header).toBe('NIT: 900');
    expect(sale.pendingSync).toBeTrue();
    expect(offlineLines(sale)).toEqual(['*** SIN CONEXIÓN ***', 'Pendiente de enviar al sistema']);
    expect(offlineLines({ offlineNumber: 'CAJA-1-SC0003' })).toEqual(['Vendida sin conexión: CAJA-1-SC0003']);
  });
});
