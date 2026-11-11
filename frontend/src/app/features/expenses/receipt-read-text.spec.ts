import { ExpenseReceiptRead } from '../../core/api/ai.api';
import { receiptFill, receiptsLeft } from './receipt-read-text';

describe('Leer el recibo con Aska (decisión 325)', () => {
  const read: ExpenseReceiptRead = {
    amount: 45230, date: '2026-11-09', categoryId: 'cat-luz', categoryName: 'Servicios públicos', supplierId: 'p1',
    supplierName: 'Enertolima', supplierDocument: '800123456', reference: 'FE-9981', note: 'Energía de octubre',
    warnings: ['Revisa los datos antes de guardar: Aska puede equivocarse.'],
    usage: { available: true, limit: 100, used: 1 },
  };
  const outside = { fromCash: false, outside: true, supplierIds: ['p1'], note: '', today: '2026-11-11' };

  it('llena todo en un gasto pagado por fuera de la caja', () => {
    expect(receiptFill(read, outside)).toEqual({
      amount: 45230, categoryId: 'cat-luz', date: '2026-11-09', supplierId: 'p1', reference: 'FE-9981',
      note: 'Energía de octubre', notices: ['Revisa los datos antes de guardar: Aska puede equivocarse.'],
    });
  });

  it('en la caja no cambia la fecha ni pone proveedor: el nombre va en la nota', () => {
    const fill = receiptFill(read, { ...outside, fromCash: true, outside: false });
    expect(fill.date).toBeUndefined();
    expect(fill.supplierId).toBeUndefined();
    expect(fill.reference).toBeUndefined();
    expect(fill.note).toBe('Enertolima · Energía de octubre');
    expect(fill.notices).toContain('El recibo es del 2026-11-09: en la caja el gasto queda con la fecha de hoy.');
  });

  it('no toca lo que no vio ni la nota que ya escribió la persona', () => {
    const fill = receiptFill({ ...read, amount: null, categoryId: null, supplierId: null, date: null },
      { ...outside, note: 'Mi nota' });
    expect(fill.amount).toBeUndefined();
    expect(fill.categoryId).toBeUndefined();
    expect(fill.date).toBeUndefined();
    expect(fill.note).toBeUndefined();
  });

  it('un proveedor que no está en la lista va en la nota', () => {
    expect(receiptFill(read, { ...outside, supplierIds: [] }).note).toBe('Enertolima · Energía de octubre');
  });

  it('dice cuántos recibos quedan', () => {
    expect(receiptsLeft(100, 1)).toBe('Te quedan 99 recibos por leer este mes.');
    expect(receiptsLeft(10, 9)).toBe('Te queda 1 recibo por leer este mes.');
    expect(receiptsLeft(10, 12)).toBe('Te quedan 0 recibos por leer este mes.');
  });
});
