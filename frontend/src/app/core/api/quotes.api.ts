import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  OrderDeliverPayment,
  PageResponse,
  Quote,
  QuoteConfig,
  QuoteFilter,
  QuoteInput,
  QuoteRow,
  QuoteSaleResult,
  QuoteToOrderInput,
} from './api.models';
import { PageQuery, pageParams } from './organization.api';

/** Cotizaciones (decisión 260). */
@Injectable({ providedIn: 'root' })
export class QuotesApi {
  private readonly http = inject(HttpClient);

  /** Vigencia y condiciones por defecto (de Ajustes). */
  config(): Observable<QuoteConfig> {
    return this.http.get<QuoteConfig>('/api/v1/quotes/config');
  }

  list(query: PageQuery, filter: QuoteFilter, search: string | null): Observable<PageResponse<QuoteRow>> {
    return this.http.get<PageResponse<QuoteRow>>('/api/v1/quotes', { params: pageParams(query, { filter, search }) });
  }

  get(id: string): Observable<Quote> {
    return this.http.get<Quote>(`/api/v1/quotes/${id}`);
  }

  save(id: string | null, input: QuoteInput): Observable<Quote> {
    return id ? this.http.put<Quote>(`/api/v1/quotes/${id}`, input) : this.http.post<Quote>('/api/v1/quotes', input);
  }

  reject(id: string, reason: string): Observable<Quote> {
    return this.http.post<Quote>(`/api/v1/quotes/${id}/reject`, { reason });
  }

  toOrder(id: string, input: QuoteToOrderInput): Observable<Quote> {
    return this.http.post<Quote>(`/api/v1/quotes/${id}/order`, input);
  }

  /** Venta con los precios cotizados; la clave es la de la venta (reintentar no la duplica). */
  sell(id: string, customerId: string | null, payments: OrderDeliverPayment[], idempotencyKey: string): Observable<QuoteSaleResult> {
    return this.http.post<QuoteSaleResult>(`/api/v1/quotes/${id}/sell`, { customerId, payments }, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }
}
