import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Order,
  OrderDeliverPayment,
  OrderDelivery,
  OrderFilter,
  OrderInput,
  OrderPaymentInput,
  OrderRow,
  OrderSummary,
  PageResponse,
} from './api.models';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { PageQuery, pageParams } from './organization.api';

/** Pedidos por encargo (decisión 258). */
@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  list(query: PageQuery, filter: OrderFilter, search: string | null): Observable<PageResponse<OrderRow>> {
    return this.http.get<PageResponse<OrderRow>>('/api/v1/orders', { params: pageParams(query, { filter, search }) });
  }

  /** Con {@code silent} (aviso del inicio), un error no muestra el toast global. */
  summary(silent = false): Observable<OrderSummary> {
    return this.http.get<OrderSummary>('/api/v1/orders/summary', {
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, silent),
    });
  }

  get(id: string): Observable<Order> {
    return this.http.get<Order>(`/api/v1/orders/${id}`);
  }

  save(id: string | null, input: OrderInput): Observable<Order> {
    return id ? this.http.put<Order>(`/api/v1/orders/${id}`, input) : this.http.post<Order>('/api/v1/orders', input);
  }

  /** La clave de idempotencia evita cobrar dos veces el anticipo si se reintenta. */
  pay(id: string, input: OrderPaymentInput, idempotencyKey: string): Observable<Order> {
    return this.http.post<Order>(`/api/v1/orders/${id}/payments`, input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  /** Entrega como venta; la clave es la de la venta (reintentar no la duplica). */
  deliver(id: string, itemIds: string[], payments: OrderDeliverPayment[], idempotencyKey: string): Observable<OrderDelivery> {
    return this.http.post<OrderDelivery>(`/api/v1/orders/${id}/deliver`, { itemIds, payments }, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  /** Devuelve el anticipo sin aplicar con {@code refundMethodId} (obligatorio si hay anticipo). */
  cancel(id: string, reason: string, refundMethodId: string | null, reference: string | null): Observable<Order> {
    return this.http.post<Order>(`/api/v1/orders/${id}/cancel`, { reason, refundMethodId, reference });
  }
}
