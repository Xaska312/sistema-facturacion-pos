import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { PageResponse, PosConfig, ProductLookup, Sale, SaleInput, SaleRow, SaleStatus } from './api.models';
import { pageParams } from './organization.api';

export interface SaleFilters {
  from: string | null;
  to: string | null;
  status: SaleStatus | null;
  search: string | null;
  cashSessionId: string | null;
}

/** Ventas: registrar (con Idempotency-Key), anular, consultar y apoyo de la pantalla de venta. */
@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);

  config(): Observable<PosConfig> {
    return this.http.get<PosConfig>('/api/v1/sales/config');
  }

  /** Precio vigente para el cliente. */
  price(productId: string, unitId: string | null, customerId: string | null): Observable<ProductLookup> {
    let params = new HttpParams().set('productId', productId);
    if (unitId) {
      params = params.set('unitId', unitId);
    }
    if (customerId) {
      params = params.set('customerId', customerId);
    }
    return this.http.get<ProductLookup>('/api/v1/sales/price', { params });
  }

  /** Código de barras o SKU con el precio de la lista del cliente; un código inexistente no muestra toast. */
  lookup(code: string, priceListId: string | null): Observable<ProductLookup> {
    const params: Record<string, string> = { code };
    if (priceListId) {
      params['priceListId'] = priceListId;
    }
    return this.http.get<ProductLookup>('/api/v1/products/lookup', {
      params,
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, true),
    });
  }

  create(input: SaleInput, idempotencyKey: string): Observable<Sale> {
    return this.http.post<Sale>('/api/v1/sales', input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  voidSale(id: string, reason: string): Observable<Sale> {
    return this.http.post<Sale>(`/api/v1/sales/${id}/void`, { reason });
  }

  search(filters: SaleFilters, page: number, size = 20): Observable<PageResponse<SaleRow>> {
    return this.http.get<PageResponse<SaleRow>>('/api/v1/sales', {
      params: pageParams({ page, size }, {
        from: filters.from,
        to: filters.to,
        status: filters.status,
        search: filters.search,
        cashSessionId: filters.cashSessionId,
      }),
    });
  }

  sale(id: string): Observable<Sale> {
    return this.http.get<Sale>(`/api/v1/sales/${id}`);
  }
}

/** Clave de idempotencia nueva (también en contextos sin {@code crypto.randomUUID}). */
export function newIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
