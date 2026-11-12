import { PaymentMethod } from '../../core/api/api.models';
import { ExpenseFilters, expenseFilterParams } from '../../core/api/expenses.api';
import {
  categoryShares,
  documentProblem,
  expenseBadge,
  expenseLine,
  expenseMethods,
  expenseNumber,
  expenseProblem,
  expenseSource,
  hasExtraFilters,
  voidBlocker,
} from './expense-text';

const method = (code: string, affectsCash: boolean, requiresReference = false): PaymentMethod =>
  ({ id: code, code, name: code, affectsCash, requiresReference }) as PaymentMethod;
const CASH = method('CASH', true);
const TRANSFER = method('TRANSFER', false);
const FILTERS: ExpenseFilters = {
  from: '2026-11-01', to: '2026-11-10', categoryId: null, branchId: null, source: null, unclassified: false,
  includeVoided: false, text: null,
};

describe('expense-text', () => {
  it('nombra el gasto por su número y el egreso de antes sin número', () => {
    expect(expenseNumber({ number: 12 })).toBe('Gasto #12');
    expect(expenseNumber({ number: null })).toBe('Egreso de caja');
    expect(expenseLine({ number: 12, categoryName: 'Arriendo', amount: 800000 })).toBe('Gasto #12 · Arriendo · $ 800.000');
  });

  it('marca el estado: anulado, sin clasificar o activo', () => {
    expect(expenseBadge({ status: 'VOID', unclassified: false })).toEqual({ key: 'voided', label: 'Anulado' });
    expect(expenseBadge({ status: 'ACTIVE', unclassified: true })).toEqual({ key: 'pending', label: 'Sin clasificar' });
    expect(expenseBadge({ status: 'ACTIVE', unclassified: false }).key).toBe('active');
  });

  it('dice de dónde salió la plata', () => {
    expect(expenseSource({ fromCash: true, paymentMethodName: 'Efectivo' })).toBe('Efectivo · de la caja');
    expect(expenseSource({ fromCash: false, paymentMethodName: 'Transferencia' })).toBe('Transferencia');
    expect(expenseSource({ fromCash: true, paymentMethodName: null })).toBe('Efectivo · de la caja');
  });

  it('reparte el total por categoría: la mayor llena la barra y los porcentajes van con un decimal', () => {
    const shares = categoryShares({
      total: 900000,
      byCategory: [
        { categoryId: 'a', name: 'Arriendo', total: 600000, count: 1 },
        { categoryId: 'b', name: 'Servicios públicos', total: 295000, count: 2 },
        { categoryId: null, name: 'Sin clasificar', total: 5000, count: 1 },
      ],
    });
    expect(shares.map((s) => s.share)).toEqual([66.7, 32.8, 0.6]);
    expect(shares.map((s) => s.bar)).toEqual([100, 49, 2]);
    expect(categoryShares({ total: 0, byCategory: [] })).toEqual([]);
  });

  it('ofrece los medios que sirven: sin fiado ni anticipo, y solo efectivo para quien solo opera caja', () => {
    const all = [CASH, method('CARD', false), TRANSFER, method('CREDIT', false), method('DEPOSIT', false)];
    expect(expenseMethods(all, false).map((m) => m.code)).toEqual(['CASH', 'CARD', 'TRANSFER']);
    expect(expenseMethods(all, true).map((m) => m.code)).toEqual(['CASH']);
  });

  it('pide lo que falta para registrar el gasto', () => {
    const draft = { amount: 30000, categoryId: 'a', method: CASH, branchId: '', date: '', reference: '' };
    expect(expenseProblem(draft, '2026-11-10')).toBeNull();
    expect(expenseProblem({ ...draft, amount: null }, '2026-11-10')).toBe('Escribe el valor del gasto.');
    expect(expenseProblem({ ...draft, categoryId: '' }, '2026-11-10')).toBe('Elige la categoría.');
    expect(expenseProblem({ ...draft, method: undefined }, '2026-11-10')).toBe('Elige con qué se pagó.');
    // Fuera de la caja lleva sede y una fecha que no sea futura.
    const bank = { ...draft, method: TRANSFER };
    expect(expenseProblem(bank, '2026-11-10')).toBe('Elige la sede del gasto.');
    expect(expenseProblem({ ...bank, branchId: 's' }, '2026-11-10')).toBe('Elige la fecha del gasto.');
    expect(expenseProblem({ ...bank, branchId: 's', date: '2026-11-11' }, '2026-11-10'))
      .toBe('La fecha del gasto no puede ser futura.');
    expect(expenseProblem({ ...bank, branchId: 's', date: '2026-11-09' }, '2026-11-10')).toBeNull();
    expect(expenseProblem({ ...bank, branchId: 's', date: '2026-11-09', method: method('NEQUI', false, true) }, '2026-11-10'))
      .toBe('Escribe la referencia del pago (NEQUI).');
  });

  it('acepta como soporte una foto o un PDF de hasta 5 MB', () => {
    expect(documentProblem({ type: 'image/jpeg', name: 'recibo.jpg', size: 9_000_000 })).toBeNull();
    expect(documentProblem({ type: 'application/pdf', name: 'recibo.pdf', size: 1000 })).toBeNull();
    expect(documentProblem({ type: '', name: 'RECIBO.PDF', size: 6 * 1024 * 1024 })).toBe('El PDF pesa más de 5 MB.');
    expect(documentProblem({ type: 'text/html', name: 'x.html', size: 10 })).toContain('foto');
  });

  it('explica por qué no se puede anular', () => {
    const base = { status: 'ACTIVE' as const, unclassified: false, fromCash: false, cashSessionOpen: false };
    expect(voidBlocker(base)).toBeNull();
    expect(voidBlocker({ ...base, fromCash: true, cashSessionOpen: true })).toBeNull();
    expect(voidBlocker({ ...base, fromCash: true })).toContain('ya se cerró');
    expect(voidBlocker({ ...base, unclassified: true })).toBe('Primero ponle categoría.');
    expect(voidBlocker({ ...base, status: 'VOID' })).toBe('Ya está anulado.');
  });

  it('sabe si hay filtros además del periodo y arma los parámetros sin los vacíos', () => {
    expect(hasExtraFilters(FILTERS)).toBeFalse();
    expect(hasExtraFilters({ ...FILTERS, text: '  ' })).toBeFalse();
    expect(hasExtraFilters({ ...FILTERS, source: 'CASH' })).toBeTrue();
    expect(expenseFilterParams({ ...FILTERS, text: ' luz ', includeVoided: true })).toEqual({
      from: '2026-11-01', to: '2026-11-10', categoryId: null, branchId: null, source: null, unclassified: null,
      includeVoided: 'true', q: 'luz',
    });
    // "Sin clasificar" manda sobre la categoría, y los totales nunca piden anulados.
    const unclassified = expenseFilterParams({ ...FILTERS, categoryId: 'a', unclassified: true, includeVoided: true }, false);
    expect(unclassified['categoryId']).toBeNull();
    expect(unclassified['unclassified']).toBe('true');
    expect(unclassified['includeVoided']).toBeNull();
  });
});
