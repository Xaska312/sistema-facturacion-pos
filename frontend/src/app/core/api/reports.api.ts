import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CategoryReportRow,
  Dashboard,
  InventoryValuation,
  MyDay,
  PaymentReportRow,
  ProductReportRow,
  ReportSummary,
  SalesReportRow,
  SlowMovers,
  TaxReportRow,
} from './api.models';

/** Filtros de los reportes. Fechas AAAA-MM-DD en la zona horaria del negocio; nulos = todos / hoy. */
export interface ReportFilters {
  from: string | null;
  to: string | null;
  branchId: string | null;
  sellerId: string | null;
}

/** Reportes que se pueden exportar a CSV (ruta relativa a /api/v1/reports). */
export type CsvReport =
  | 'sales'
  | 'sales/by-day'
  | 'sales/by-branch'
  | 'sales/by-seller'
  | 'sales/by-payment-method'
  | 'products'
  | 'categories'
  | 'taxes'
  | 'inventory/valuation'
  | 'inventory/slow-movers';

export function reportParams(filters: ReportFilters, extra: Record<string, string | number | null> = {}): HttpParams {
  let params = new HttpParams();
  const all: Record<string, string | number | null> = {
    from: filters.from,
    to: filters.to,
    branchId: filters.branchId,
    sellerId: filters.sellerId,
    ...extra,
  };
  for (const [key, value] of Object.entries(all)) {
    if (value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/** Reportes y tablero (permiso reports:read); "mis ventas de hoy" con sales:read. */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/reports';

  dashboard(branchId: string | null): Observable<Dashboard> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : new HttpParams();
    return this.http.get<Dashboard>(`${this.base}/dashboard`, { params });
  }

  myDay(): Observable<MyDay> {
    return this.http.get<MyDay>(`${this.base}/my-day`);
  }

  summary(filters: ReportFilters): Observable<ReportSummary> {
    return this.http.get<ReportSummary>(`${this.base}/sales/summary`, { params: reportParams(filters) });
  }

  salesBy(group: 'by-day' | 'by-branch' | 'by-seller', filters: ReportFilters): Observable<SalesReportRow[]> {
    return this.http.get<SalesReportRow[]>(`${this.base}/sales/${group}`, { params: reportParams(filters) });
  }

  byPaymentMethod(filters: ReportFilters): Observable<PaymentReportRow[]> {
    return this.http.get<PaymentReportRow[]>(`${this.base}/sales/by-payment-method`, { params: reportParams(filters) });
  }

  products(filters: ReportFilters, orderBy: 'total' | 'quantity', limit: number): Observable<ProductReportRow[]> {
    return this.http.get<ProductReportRow[]>(`${this.base}/products`, {
      params: reportParams(filters, { orderBy, limit }),
    });
  }

  categories(filters: ReportFilters): Observable<CategoryReportRow[]> {
    return this.http.get<CategoryReportRow[]>(`${this.base}/categories`, { params: reportParams(filters) });
  }

  taxes(filters: ReportFilters): Observable<TaxReportRow[]> {
    return this.http.get<TaxReportRow[]>(`${this.base}/taxes`, { params: reportParams(filters) });
  }

  valuation(branchId: string | null): Observable<InventoryValuation> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : new HttpParams();
    return this.http.get<InventoryValuation>(`${this.base}/inventory/valuation`, { params });
  }

  /** Productos con existencia que no se venden hace {@code days} días (decisión 254). */
  slowMovers(branchId: string | null, days: number): Observable<SlowMovers> {
    let params = new HttpParams().set('days', String(days));
    if (branchId) {
      params = params.set('branchId', branchId);
    }
    return this.http.get<SlowMovers>(`${this.base}/inventory/slow-movers`, { params });
  }

  /** Descarga el CSV (Excel en español) con el nombre que propone el servidor. */
  csv(report: CsvReport, filters: ReportFilters, extra: Record<string, string | number | null> = {}):
    Observable<HttpResponse<Blob>> {
    // El inventario es "hoy": no lleva periodo ni vendedor.
    const params = report === 'inventory/valuation' || report === 'inventory/slow-movers'
      ? reportParams({ from: null, to: null, branchId: filters.branchId, sellerId: null }, extra)
      : reportParams(filters, extra);
    return this.http.get(`${this.base}/${report}.csv`, { params, observe: 'response', responseType: 'blob' });
  }
}
