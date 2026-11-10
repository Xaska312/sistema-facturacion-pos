import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

export interface ExpenseCategory {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export type ExpenseStatus = 'ACTIVE' | 'VOID';

/**
 * Un gasto (decisión 320). {@code unclassified}: egreso de caja de antes, sin categoría; su {@code id} es el del
 * movimiento de caja y no tiene número. {@code fromCash}: salió del efectivo de una caja.
 */
export interface Expense {
  id: string;
  number: number | null;
  date: string;
  categoryId: string | null;
  categoryName: string;
  branchId: string;
  branchName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  amount: number;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  fromCash: boolean;
  /** La caja de donde salió sigue abierta: un gasto en efectivo solo se anula mientras lo esté. */
  cashSessionOpen: boolean;
  reference: string | null;
  note: string | null;
  status: ExpenseStatus;
  voidReason: string | null;
  unclassified: boolean;
  hasDocument: boolean;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface ExpenseCategoryTotal {
  categoryId: string | null;
  name: string;
  total: number;
  count: number;
}

export interface ExpenseMethodTotal {
  paymentMethodId: string | null;
  name: string | null;
  total: number;
  count: number;
}

export interface ExpenseSummary {
  from: string;
  to: string;
  total: number;
  count: number;
  cashTotal: number;
  otherTotal: number;
  unclassifiedCount: number;
  unclassifiedTotal: number;
  byCategory: ExpenseCategoryTotal[];
  byMethod: ExpenseMethodTotal[];
}

export type ExpenseSource = 'CASH' | 'OTHER';

export interface ExpenseFilters {
  from: string;
  to: string;
  categoryId: string | null;
  branchId: string | null;
  source: ExpenseSource | null;
  unclassified: boolean;
  includeVoided: boolean;
  text: string | null;
}

export interface ExpenseInput {
  amount: number;
  categoryId: string;
  paymentMethodId: string;
  /** Solo fuera de la caja: en efectivo la sede y la fecha son las de la caja. */
  branchId: string | null;
  date: string | null;
  supplierId: string | null;
  reference: string | null;
  note: string | null;
}

export interface ExpenseUpdate {
  categoryId: string;
  date: string | null;
  supplierId: string | null;
  reference: string | null;
  note: string | null;
}

/** Los filtros del listado como parámetros (los vacíos no viajan). */
export function expenseFilterParams(filters: ExpenseFilters, withVoided = true): Record<string, string | null> {
  return {
    from: filters.from,
    to: filters.to,
    categoryId: filters.unclassified ? null : filters.categoryId,
    branchId: filters.branchId,
    source: filters.source,
    unclassified: filters.unclassified ? 'true' : null,
    includeVoided: withVoided && filters.includeVoided ? 'true' : null,
    q: filters.text?.trim() || null,
  };
}

/** Gastos con categorías (Finanzas parte A, decisión 320). */
@Injectable({ providedIn: 'root' })
export class ExpensesApi {
  private readonly http = inject(HttpClient);

  categories(includeInactive = false): Observable<ExpenseCategory[]> {
    return this.http.get<ExpenseCategory[]>('/api/v1/expense-categories', {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  createCategory(name: string): Observable<ExpenseCategory> {
    return this.http.post<ExpenseCategory>('/api/v1/expense-categories', { name });
  }

  updateCategory(id: string, change: { name?: string; active?: boolean }): Observable<ExpenseCategory> {
    return this.http.put<ExpenseCategory>(`/api/v1/expense-categories/${id}`, change);
  }

  list(query: PageQuery, filters: ExpenseFilters): Observable<PageResponse<Expense>> {
    return this.http.get<PageResponse<Expense>>('/api/v1/expenses', {
      params: pageParams(query, expenseFilterParams(filters)),
    });
  }

  summary(filters: ExpenseFilters): Observable<ExpenseSummary> {
    return this.http.get<ExpenseSummary>('/api/v1/expenses/summary', { params: this.params(filters, false) });
  }

  /** El listado del filtro para Excel. */
  csv(filters: ExpenseFilters): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/v1/expenses.csv', {
      params: this.params(filters, true), responseType: 'blob', observe: 'response',
    });
  }

  create(input: ExpenseInput, idempotencyKey: string): Observable<Expense> {
    return this.http.post<Expense>('/api/v1/expenses', input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  update(id: string, input: ExpenseUpdate): Observable<Expense> {
    return this.http.put<Expense>(`/api/v1/expenses/${id}`, input);
  }

  /** Le pone categoría a un egreso de caja de antes ({@code movementId} es el id con que sale en el listado). */
  classify(movementId: string, input: { categoryId: string; supplierId: string | null; note: string | null }): Observable<Expense> {
    return this.http.post<Expense>(`/api/v1/expenses/unclassified/${movementId}/classify`, input);
  }

  void(id: string, reason: string): Observable<Expense> {
    return this.http.post<Expense>(`/api/v1/expenses/${id}/void`, { reason });
  }

  /** Foto o PDF del soporte (hasta 5 MB). */
  attach(id: string, file: File): Observable<Expense> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<Expense>(`/api/v1/expenses/${id}/document`, form);
  }

  document(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/api/v1/expenses/${id}/document`, { responseType: 'blob', observe: 'response' });
  }

  private params(filters: ExpenseFilters, withVoided: boolean): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(expenseFilterParams(filters, withVoided))) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return params;
  }
}

// ---------------------------------------------------------------- gastos fijos (decisión 321)

export type RecurringFrequency = 'MONTHLY' | 'BIWEEKLY';

/** Un gasto fijo: lo que se repite cada mes (un día) o cada quincena (el 15 y el último día). */
export interface RecurringExpense {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  branchId: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  amount: number;
  paymentMethodId: string;
  paymentMethodName: string;
  fromCash: boolean;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  startsOn: string;
  note: string | null;
  active: boolean;
  /** Próxima fecha de pago (nula si está apagado). */
  nextDue: string | null;
}

export interface RecurringExpenseInput {
  name: string;
  categoryId: string;
  branchId: string;
  supplierId: string | null;
  amount: number;
  paymentMethodId: string;
  frequency: RecurringFrequency;
  dayOfMonth: number | null;
  startsOn: string | null;
  note: string | null;
  active?: boolean;
}

/** Una fecha por pagar. {@code daysUntil} negativo: vencida hace esos días. */
export interface RecurringDue {
  recurringId: string;
  name: string;
  dueDate: string;
  overdue: boolean;
  daysUntil: number;
  frequency: RecurringFrequency;
  categoryId: string;
  categoryName: string;
  branchId: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  amount: number;
  paymentMethodId: string;
  paymentMethodName: string;
  fromCash: boolean;
  note: string | null;
}

export interface RecurringDueSummary {
  count: number;
  overdueCount: number;
  total: number;
  items: RecurringDue[];
}

/** Lo que se paga de verdad; lo vacío se toma del gasto fijo. */
export interface RecurringPayment {
  dueDate: string;
  amount: number;
  paymentMethodId: string;
  branchId: string | null;
  date: string | null;
  supplierId: string | null;
  reference: string | null;
  note: string | null;
}

@Injectable({ providedIn: 'root' })
export class RecurringExpensesApi {
  private readonly http = inject(HttpClient);

  list(): Observable<RecurringExpense[]> {
    return this.http.get<RecurringExpense[]>('/api/v1/recurring-expenses');
  }

  /** Vencido (hasta 3 meses) y lo de los próximos 7 días. */
  due(): Observable<RecurringDueSummary> {
    return this.http.get<RecurringDueSummary>('/api/v1/recurring-expenses/due');
  }

  create(input: RecurringExpenseInput): Observable<RecurringExpense> {
    return this.http.post<RecurringExpense>('/api/v1/recurring-expenses', input);
  }

  update(id: string, input: RecurringExpenseInput): Observable<RecurringExpense> {
    return this.http.put<RecurringExpense>(`/api/v1/recurring-expenses/${id}`, input);
  }

  pay(id: string, payment: RecurringPayment, idempotencyKey: string): Observable<Expense> {
    return this.http.post<Expense>(`/api/v1/recurring-expenses/${id}/pay`, payment, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  /** "Este mes no": la fecha deja de estar por pagar sin registrar gasto. */
  skip(id: string, dueDate: string): Observable<void> {
    return this.http.post<void>(`/api/v1/recurring-expenses/${id}/skip`, { dueDate });
  }

  unskip(id: string, dueDate: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/recurring-expenses/${id}/skip/${dueDate}`);
  }
}
