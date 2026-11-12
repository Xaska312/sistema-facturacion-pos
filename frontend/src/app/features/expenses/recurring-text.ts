import { RecurringDue, RecurringExpense, RecurringFrequency } from '../../core/api/expenses.api';
import { formatCop } from '../../shared/money';
import { formatDay } from '../orders/order-text';

/** "Cada mes, el día 5" o "Cada quincena (el 15 y el último día)". */
export function frequencyLabel(r: Pick<RecurringExpense, 'frequency' | 'dayOfMonth'>): string {
  if (r.frequency === 'BIWEEKLY') {
    return 'Cada quincena (el 15 y el último día)';
  }
  const day = r.dayOfMonth ?? 1;
  return day >= 29 ? `Cada mes, el día ${day} (o el último día)` : `Cada mes, el día ${day}`;
}

/** "Venció hace 3 días", "Vence hoy", "Vence mañana", "Vence en 4 días". */
export function dueLabel(due: Pick<RecurringDue, 'daysUntil'>): string {
  const d = due.daysUntil;
  if (d < -1) {
    return `Venció hace ${-d} días`;
  }
  if (d === -1) {
    return 'Venció ayer';
  }
  if (d === 0) {
    return 'Vence hoy';
  }
  return d === 1 ? 'Vence mañana' : `Vence en ${d} días`;
}

/** Botón para saltar una fecha: "Este mes no" o "Esta quincena no". */
export function skipLabel(frequency: RecurringFrequency): string {
  return frequency === 'BIWEEKLY' ? 'Esta quincena no' : 'Este mes no';
}

/** Para la tarjeta de Inicio: "2 gastos fijos por pagar (1 vencido) · $ 1.600.000". */
export function dueHeadline(summary: { count: number; overdueCount: number; total: number }): string {
  const what = summary.count === 1 ? '1 gasto fijo por pagar' : `${summary.count} gastos fijos por pagar`;
  const late = summary.overdueCount === 0 ? ''
    : summary.overdueCount === 1 ? ' (1 vencido)' : ` (${summary.overdueCount} vencidos)`;
  return `${what}${late} · ${formatCop(summary.total)}`;
}

/** Línea de un pendiente: "Arriendo del local · 5 nov 2026". */
export function dueLine(due: Pick<RecurringDue, 'name' | 'dueDate'>): string {
  return `${due.name} · ${formatDay(due.dueDate)}`;
}

export interface RecurringDraft {
  name: string;
  amount: number | null;
  categoryId: string;
  branchId: string;
  methodId: string;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
}

/** Qué le falta al gasto fijo; nulo si está completo. */
export function recurringProblem(d: RecurringDraft): string | null {
  if (!d.name.trim()) {
    return 'Escribe el nombre (ej.: Arriendo del local).';
  }
  if (!(Number(d.amount ?? 0) > 0)) {
    return 'Escribe el valor de cada pago.';
  }
  if (!d.categoryId) {
    return 'Elige la categoría.';
  }
  if (!d.methodId) {
    return 'Elige con qué se paga normalmente.';
  }
  if (!d.branchId) {
    return 'Elige la sede.';
  }
  if (d.frequency === 'MONTHLY') {
    const day = Number(d.dayOfMonth ?? 0);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return 'Elige el día del mes en que se paga (1 a 31).';
    }
  }
  return null;
}
