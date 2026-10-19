import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CreditAccount, CreditEntry, CreditPaymentInput, CreditSummary, PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

/** Filtro de la cartera: solo quienes deben, o también los que tienen cupo sin deuda. */
export type CreditFilter = 'DEBT' | 'ALL';

/** Fiado: cartera, cuenta de cada cliente, abonos y su anulación (decisión 255). */
@Injectable({ providedIn: 'root' })
export class CreditApi {
  private readonly http = inject(HttpClient);

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
