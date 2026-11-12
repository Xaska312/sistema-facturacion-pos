import { Expense, ExpenseCategoryTotal, ExpenseFilters, ExpenseSummary } from '../../core/api/expenses.api';
import { PaymentMethod } from '../../core/api/api.models';
import { StatusKey } from '../../shared/status';
import { formatCop } from '../../shared/money';

/** Soporte de un gasto: lo que admite el servidor. */
export const MAX_EXPENSE_DOCUMENT_BYTES = 5 * 1024 * 1024;
const DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** "Gasto #12"; un egreso sin clasificar todavía no tiene número. */
export function expenseNumber(expense: Pick<Expense, 'number'>): string {
  return expense.number === null ? 'Egreso de caja' : `Gasto #${expense.number}`;
}

export function expenseBadge(expense: Pick<Expense, 'status' | 'unclassified'>): { key: StatusKey; label: string } {
  if (expense.status === 'VOID') {
    return { key: 'voided', label: 'Anulado' };
  }
  return expense.unclassified ? { key: 'pending', label: 'Sin clasificar' } : { key: 'active', label: 'Activo' };
}

/** De dónde salió la plata, en palabras: "Efectivo · de la caja" o "Transferencia". */
export function expenseSource(expense: Pick<Expense, 'fromCash' | 'paymentMethodName'>): string {
  const method = expense.paymentMethodName ?? 'Efectivo';
  return expense.fromCash ? `${method} · de la caja` : method;
}

export interface CategoryShare extends ExpenseCategoryTotal {
  /** Parte del total, de 0 a 100 (con un decimal). */
  share: number;
  /** Ancho de la barra frente a la categoría más grande, de 0 a 100. */
  bar: number;
}

/** Cada categoría con su parte del total y el ancho de su barra (la mayor llena la barra). */
export function categoryShares(summary: Pick<ExpenseSummary, 'total' | 'byCategory'>): CategoryShare[] {
  const max = Math.max(0, ...summary.byCategory.map((c) => c.total));
  return summary.byCategory.map((c) => ({
    ...c,
    share: summary.total > 0 ? Math.round((c.total / summary.total) * 1000) / 10 : 0,
    bar: max > 0 ? Math.max(2, Math.round((c.total / max) * 100)) : 0,
  }));
}

/** Medios con los que se paga un gasto: todos menos Fiado y Anticipo. Quien solo opera caja, solo efectivo. */
export function expenseMethods(methods: readonly PaymentMethod[], cashOnly: boolean): PaymentMethod[] {
  return methods.filter((m) => m.code !== 'CREDIT' && m.code !== 'DEPOSIT' && (!cashOnly || m.affectsCash));
}

export interface ExpenseDraft {
  amount: number | null;
  categoryId: string;
  method: PaymentMethod | undefined;
  branchId: string;
  date: string;
  reference: string;
}

/** Qué le falta al gasto para guardarlo; nulo si está completo. {@code today} en formato AAAA-MM-DD. */
export function expenseProblem(draft: ExpenseDraft, today: string): string | null {
  if (!(Number(draft.amount ?? 0) > 0)) {
    return 'Escribe el valor del gasto.';
  }
  if (!draft.categoryId) {
    return 'Elige la categoría.';
  }
  if (!draft.method) {
    return 'Elige con qué se pagó.';
  }
  if (!draft.method.affectsCash) {
    if (!draft.branchId) {
      return 'Elige la sede del gasto.';
    }
    if (!draft.date) {
      return 'Elige la fecha del gasto.';
    }
    if (draft.date > today) {
      return 'La fecha del gasto no puede ser futura.';
    }
    if (draft.method.requiresReference && !draft.reference.trim()) {
      return `Escribe la referencia del pago (${draft.method.name}).`;
    }
  }
  return null;
}

/** Qué falla en el archivo del soporte; nulo si sirve. Las fotos se reducen antes de subir, el PDF no. */
export function documentProblem(file: { type: string; name: string; size: number }): string | null {
  const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!pdf && !DOCUMENT_TYPES.includes(file.type)) {
    return 'El soporte debe ser una foto (JPG o PNG) o un PDF.';
  }
  if (pdf && file.size > MAX_EXPENSE_DOCUMENT_BYTES) {
    return 'El PDF pesa más de 5 MB.';
  }
  return null;
}

/** ¿Hay algún filtro además del periodo? */
export function hasExtraFilters(filters: ExpenseFilters): boolean {
  return Boolean(filters.categoryId || filters.branchId || filters.source || filters.unclassified
    || filters.includeVoided || filters.text?.trim());
}

/** Por qué no se puede anular; nulo si se puede. */
export function voidBlocker(expense: Pick<Expense, 'status' | 'unclassified' | 'fromCash' | 'cashSessionOpen'>): string | null {
  if (expense.status === 'VOID') {
    return 'Ya está anulado.';
  }
  if (expense.unclassified) {
    return 'Primero ponle categoría.';
  }
  if (expense.fromCash && !expense.cashSessionOpen) {
    return 'Salió de una caja que ya se cerró: el efectivo no puede volver a ella.';
  }
  return null;
}

/** Resumen de un gasto para confirmar: "Gasto #12 · Arriendo · $ 800.000". */
export function expenseLine(expense: Pick<Expense, 'number' | 'categoryName' | 'amount'>): string {
  return `${expenseNumber(expense)} · ${expense.categoryName} · ${formatCop(expense.amount)}`;
}
