import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

export type WithholdingType = 'RETEFUENTE' | 'RETEICA' | 'RETEIVA';

/** Retención habitual de un cliente (Indesa: retefuente 6 %). */
export interface CustomerWithholding {
  type: WithholdingType;
  rate: number;
}

/** Detalle de la línea de pago "Retención" que se envía al cobrar. */
export interface WithholdingLine {
  type: WithholdingType;
  base: number | null;
  rate: number | null;
  amount: number | null;
}

/** Una retención del reporte. */
export interface Withholding {
  id: string;
  date: string;
  customerId: string;
  customerName: string;
  customerDocument: string | null;
  type: WithholdingType;
  base: number;
  rate: number | null;
  amount: number;
  origin: string;
  saleId: string | null;
  orderId: string | null;
  /** Reversa de un abono de pedido cancelado (negativa). */
  reversal: boolean;
  /** De una venta anulada: no suma. */
  voided: boolean;
  certificateReceived: boolean;
  certificateNote: string | null;
  certificateAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface WithholdingTypeTotal {
  type: WithholdingType;
  total: number;
  count: number;
}

export interface WithholdingCustomerTotal {
  customerId: string;
  name: string;
  document: string | null;
  total: number;
  count: number;
  pendingCertificates: number;
  pendingTotal: number;
}

export interface WithholdingSummary {
  from: string;
  to: string;
  total: number;
  count: number;
  pendingCertificates: number;
  pendingTotal: number;
  byType: WithholdingTypeTotal[];
  byCustomer: WithholdingCustomerTotal[];
}

export type CertificateFilter = 'PENDING' | 'RECEIVED';

export interface WithholdingFilters {
  from: string;
  to: string;
  customerId: string | null;
  type: WithholdingType | null;
  certificate: CertificateFilter | null;
  includeVoided: boolean;
}

export function withholdingFilterParams(f: WithholdingFilters, withVoided = true): Record<string, string | null> {
  return {
    from: f.from,
    to: f.to,
    customerId: f.customerId,
    type: f.type,
    certificate: f.certificate,
    includeVoided: withVoided && f.includeVoided ? 'true' : null,
  };
}

/** Retenciones (Finanzas parte B, decisión 322). */
@Injectable({ providedIn: 'root' })
export class WithholdingsApi {
  private readonly http = inject(HttpClient);

  usual(customerId: string): Observable<CustomerWithholding[]> {
    return this.http.get<CustomerWithholding[]>(`/api/v1/customers/${customerId}/withholdings`);
  }

  setUsual(customerId: string, items: CustomerWithholding[]): Observable<CustomerWithholding[]> {
    return this.http.put<CustomerWithholding[]>(`/api/v1/customers/${customerId}/withholdings`, { items });
  }

  list(query: PageQuery, filters: WithholdingFilters): Observable<PageResponse<Withholding>> {
    return this.http.get<PageResponse<Withholding>>('/api/v1/withholdings', {
      params: pageParams(query, withholdingFilterParams(filters)),
    });
  }

  summary(filters: WithholdingFilters): Observable<WithholdingSummary> {
    return this.http.get<WithholdingSummary>('/api/v1/withholdings/summary', { params: this.params(filters, false) });
  }

  csv(filters: WithholdingFilters): Observable<HttpResponse<Blob>> {
    return this.http.get('/api/v1/withholdings.csv', {
      params: this.params(filters, true), responseType: 'blob', observe: 'response',
    });
  }

  certificate(ids: string[], received: boolean, note: string | null): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>('/api/v1/withholdings/certificate', { ids, received, note });
  }

  private params(filters: WithholdingFilters, withVoided: boolean): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(withholdingFilterParams(filters, withVoided))) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return params;
  }
}
