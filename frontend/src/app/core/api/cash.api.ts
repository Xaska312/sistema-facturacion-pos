import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
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
  WITHHOLDING_METHOD_CODE,
} from './api.models';
import { pageParams } from './organization.api';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';

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

  /** Medios para cobrar y pagar. Sin "Retención" (decisión 322): esa la agrega el recuadro de retención. */
  paymentMethods(): Observable<PaymentMethod[]> {
    return this.allPaymentMethods().pipe(map((list) => list.filter((m) => m.code !== WITHHOLDING_METHOD_CODE)));
  }

  /** Todos los medios, también "Retención". */
  allPaymentMethods(): Observable<PaymentMethod[]> {
    return this.http.get<PaymentMethod[]>('/api/v1/payment-methods');
  }

  registers(): Observable<RegisterOption[]> {
    return this.http.get<RegisterOption[]>('/api/v1/cash/registers');
  }

  /** Deja en la auditoría que se abrió el cajón sin una venta (decisión 286); el cajón lo abre XASKA Impresora. */
  drawerOpened(reason: string | null): Observable<void> {
    return this.http.post<void>('/api/v1/cash/drawer-openings', { reason },
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  /** Vender en una caja compartida que abrió otra persona (decisión 256). */
  join(sessionId: string): Observable<CashSession> {
    return this.http.post<CashSession>(`/api/v1/cash/sessions/${sessionId}/join`, null);
  }

  /** Dejar de vender en la caja compartida (no la cierra). */
  leave(): Observable<void> {
    return this.http.post<void>('/api/v1/cash/sessions/current/leave', null);
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

  sessions(filters: CashSessionFilters, page: number, size = 20): Observable<PageResponse<CashSession>> {
    return this.http.get<PageResponse<CashSession>>('/api/v1/cash/sessions', {
      params: pageParams({ page, size }, {
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
