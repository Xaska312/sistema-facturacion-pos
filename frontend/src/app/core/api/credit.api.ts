import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { SILENT_ALL_ERRORS } from '../errors/error.interceptor';
import { SKIP_GLOBAL_LOADING } from '../loading/loading';
import { CreditAccount, CreditEntry, CreditPaymentInput, CreditSummary, PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

/** Filtro de la cartera: solo quienes deben, o también los que tienen cupo sin deuda. */
export type CreditFilter = 'DEBT' | 'ALL';

/** Fiado: cartera, cuenta de cada cliente, abonos y su anulación (decisión 255). */
@Injectable({ providedIn: 'root' })
export class CreditApi {
  private readonly http = inject(HttpClient);

  /**
   * Mensaje con que se recuerda el fiado (decisión 344); '' = el de siempre. Si falla se usa el de siempre sin
   * molestar al cajero con un error.
   */
  reminderTemplate(): Observable<string> {
    return this.http.get<{ template: string }>('/api/v1/credit/reminder-template', {
      context: new HttpContext().set(SILENT_ALL_ERRORS, true).set(SKIP_GLOBAL_LOADING, true),
    }).pipe(map((r) => r.template ?? ''), catchError(() => of('')));
  }

  summary(): Observable<CreditSummary> {
    return this.http.get<CreditSummary>('/api/v1/credit/summary');
  }

  accounts(query: PageQuery, search: string | null, filter: CreditFilter): Observable<PageResponse<CreditAccount>> {
    return this.http.get<PageResponse<CreditAccount>>('/api/v1/credit/accounts', {
      params: pageParams(query, { search, filter }),
    });
  }

  account(customerId: string): Observable<CreditAccount> {
    return this.http.get<CreditAccount>(`/api/v1/credit/accounts/${customerId}`);
  }

  entries(customerId: string, query: PageQuery): Observable<PageResponse<CreditEntry>> {
    return this.http.get<PageResponse<CreditEntry>>(`/api/v1/credit/accounts/${customerId}/entries`, {
      params: pageParams(query),
    });
  }

  /** La clave de idempotencia evita registrar dos veces el abono si se reintenta. */
  pay(customerId: string, input: CreditPaymentInput, idempotencyKey: string): Observable<CreditEntry> {
    return this.http.post<CreditEntry>(`/api/v1/credit/accounts/${customerId}/payments`, input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  voidPayment(entryId: string, reason: string): Observable<CreditEntry> {
    return this.http.post<CreditEntry>(`/api/v1/credit/payments/${entryId}/void`, { reason });
  }
}
