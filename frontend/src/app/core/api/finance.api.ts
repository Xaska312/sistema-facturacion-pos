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
