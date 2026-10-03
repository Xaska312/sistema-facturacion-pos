import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  CashMovement,
  CashReport,
  CashSession,
  CashSessionStatus,
  ManualCashMovementType,
  PageResponse,
  PaymentMethod,
  RegisterOption,
} from './api.models';
import { pageParams } from './organization.api';

export interface CashSessionFilters {
  status: CashSessionStatus | null;
  cashRegisterId: string | null;
  from: string | null;
  to: string | null;
}

/** Caja: apertura, movimientos, cierre (arqueo ciego) e informes. */
@Injectable({ providedIn: 'root' })
export class CashApi {
  private readonly http = inject(HttpClient);

  paymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>('/api/v1/payment-methods');
  }

  registers(): Observable<RegisterOption[]> {
    return this.http.get<RegisterOption[]>('/api/v1/cash/registers');
  }

  /** Sesión abierta del usuario; {@code null} si no tiene caja abierta (204). */
  current(): Observable<CashSession | null> {
    return this.http
      .get<CashSession>('/api/v1/cash/sessions/current', { observe: 'response' })
      .pipe(map((response) => (response.status === 204 ? null : response.body)));
  }

  open(cashRegisterId: string, openingAmount: number, notes: string | null): Observable<CashSession> {
    return this.http.post<CashSession>('/api/v1/cash/sessions', { cashRegisterId, openingAmount, notes });
  }

  addMovement(sessionId: string, type: ManualCashMovementType, amount: number, reason: string,
              idempotencyKey: string): Observable<CashMovement> {
    return this.http.post<CashMovement>(`/api/v1/cash/sessions/${sessionId}/movements`, { type, amount, reason }, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  close(sessionId: string, countedAmount: number, notes: string | null): Observable<CashReport> {
    return this.http.post<CashReport>(`/api/v1/cash/sessions/${sessionId}/close`, { countedAmount, notes });
  }

  sessions(filters: CashSessionFilters, page: number): Observable<PageResponse<CashSession>> {
    return this.http.get<PageResponse<CashSession>>('/api/v1/cash/sessions', {
      params: pageParams({ page, size: 20 }, {
        status: filters.status,
        cashRegisterId: filters.cashRegisterId,
        from: filters.from,
        to: filters.to,
      }),
    });
  }

  session(id: string): Observable<CashSession> {
    return this.http.get<CashSession>(`/api/v1/cash/sessions/${id}`);
  }

  movements(id: string): Observable<CashMovement[]> {
    return this.http.get<CashMovement[]>(`/api/v1/cash/sessions/${id}/movements`);
  }

  report(id: string): Observable<CashReport> {
    return this.http.get<CashReport>(`/api/v1/cash/sessions/${id}/report`);
  }
}
