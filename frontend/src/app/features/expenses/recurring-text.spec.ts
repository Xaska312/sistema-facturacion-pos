import { dueHeadline, dueLabel, frequencyLabel, recurringProblem, skipLabel } from './recurring-text';

describe('recurring-text (decisión 321)', () => {
  it('dice cada cuánto se paga', () => {
    expect(frequencyLabel({ frequency: 'MONTHLY', dayOfMonth: 5 })).toBe('Cada mes, el día 5');
    expect(frequencyLabel({ frequency: 'MONTHLY', dayOfMonth: 31 })).toBe('Cada mes, el día 31 (o el último día)');
    expect(frequencyLabel({ frequency: 'BIWEEKLY', dayOfMonth: null })).toBe('Cada quincena (el 15 y el último día)');
  });

  it('dice cuándo vence', () => {
    expect(dueLabel({ daysUntil: -3 })).toBe('Venció hace 3 días');
    expect(dueLabel({ daysUntil: -1 })).toBe('Venció ayer');
    expect(dueLabel({ daysUntil: 0 })).toBe('Vence hoy');
    expect(dueLabel({ daysUntil: 1 })).toBe('Vence mañana');
    expect(dueLabel({ daysUntil: 6 })).toBe('Vence en 6 días');
  });

  it('nombra el botón de saltar según la frecuencia', () => {
    expect(skipLabel('MONTHLY')).toBe('Este mes no');
    expect(skipLabel('BIWEEKLY')).toBe('Esta quincena no');
  });

  it('resume lo pendiente para Inicio', () => {
    expect(dueHeadline({ count: 1, overdueCount: 0, total: 800000 })).toBe('1 gasto fijo por pagar · $ 800.000');
    expect(dueHeadline({ count: 3, overdueCount: 2, total: 1600000 }))
      .toBe('3 gastos fijos por pagar (2 vencidos) · $ 1.600.000');
  });

  it('pide lo que falta', () => {
    const ok = { name: 'Arriendo', amount: 800000, categoryId: 'c', branchId: 'b', methodId: 'm',
      frequency: 'MONTHLY' as const, dayOfMonth: 5 };
    expect(recurringProblem(ok)).toBeNull();
    expect(recurringProblem({ ...ok, name: ' ' })).toContain('nombre');
    expect(recurringProblem({ ...ok, amount: 0 })).toContain('valor');
    expect(recurringProblem({ ...ok, dayOfMonth: 32 })).toContain('día del mes');
    expect(recurringProblem({ ...ok, frequency: 'BIWEEKLY', dayOfMonth: null })).toBeNull();
  });
});
