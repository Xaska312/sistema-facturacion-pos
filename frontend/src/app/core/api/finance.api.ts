import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface StatementLine {
  categoryId: string | null;
  name: string;
  amount: number;
}

/**
 * Un periodo del estado de resultados (decisión 323). Ventas netas sin impuestos − costo = utilidad bruta; − gastos =
 * utilidad operativa. {@code withheld} es nulo al filtrar por sede.
 */
export interface Statement {
  from: string;
  to: string;
  salesCount: number;
  salesTotal: number;
  tax: number;
  netSales: number;
  cost: number;
  grossProfit: number;
  grossMargin: number | null;
  expenses: StatementLine[];
  expensesTotal: number;
  operatingProfit: number;
  operatingMargin: number | null;
  withheld: number | null;
  hasData: boolean;
}

export interface IncomeStatement {
  branchId: string | null;
  branchName: string | null;
  current: Statement;
  /** Periodo anterior; nulo si no tiene datos. */
  previous: Statement | null;
  /** Mismo periodo del año pasado; nulo si no tiene datos. */
  lastYear: Statement | null;
  /** Gastos fijos del periodo sin pagar: se avisan, no se restan. */
  unpaidRecurring: { count: number; total: number };
}

function params(from: string, to: string, branchId: string | null): HttpParams {
  let p = new HttpParams().set('from', from).set('to', to);
  if (branchId) {
    p = p.set('branchId', branchId);
  }
  return p;
}

/** Estado de resultados (Finanzas parte C). */
@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private readonly http = inject(HttpClient);

  incomeStatement(from: string, to: string, branchId: string | null): Observable<IncomeStatement> {
    return this.http.get<IncomeStatement>('/api/v1/finance/income-statement', { params: params(from, to, branchId) });
  }

  incomeStatementCsv(from: string, to: string, branchId: string | null): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/v1/finance/income-statement.csv', {
      params: params(from, to, branchId), responseType: 'blob', observe: 'response',
    });
  }
}

// ---------------------------------------------------------------- tablero (decisión 324)

export interface MethodFlow {
  paymentMethodId: string;
  name: string;
  cash: boolean;
  in: number;
  out: number;
  net: number;
}

export interface FinanceDashboard {
  from: string;
  to: string;
  netSales: number;
  grossProfit: number;
  operatingProfit: number;
  flow: { in: number; out: number; net: number; byMethod: MethodFlow[] };
  balances: {
    creditOwed: number;
    creditCustomers: number;
    ordersOwed: number;
    openOrders: number;
    suppliersOwed: number;
    suppliersOverdue: number;
    suppliersDueSoon: number;
  };
  expenses: {
    thisMonth: number;
    lastMonth: number;
    changePercent: number | null;
    top: { categoryId: string | null; name: string; total: number; count: number }[];
    unpaidRecurring: number;
    unpaidRecurringTotal: number;
  };
  /** {@code basis}: LAST_MONTH, RECURRING o nulo si no hay con qué calcular. */
  breakEven: {
    basis: 'LAST_MONTH' | 'RECURRING' | null;
    monthlyExpenses: number;
    grossMargin: number | null;
    perMonth: number | null;
    perDay: number | null;
    averageDailySales: number;
    monthSales: number;
    monthTarget: number | null;
  };
}

@Injectable({ providedIn: 'root' })
export class FinanceDashboardApi {
  private readonly http = inject(HttpClient);

  dashboard(): Observable<FinanceDashboard> {
    return this.http.get<FinanceDashboard>('/api/v1/finance/dashboard');
  }
}
