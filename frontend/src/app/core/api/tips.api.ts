import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BranchOption } from './dining.api';

/** Propinas (Fase 12b-5, decisión 272). */
export interface TipMethodTotal {
  methodName: string;
  amount: number;
  count: number;
}

export interface TipPerson {
  memberId: string;
  name: string;
}

export interface TipShare {
  memberId: string;
  name: string;
  amount: number;
}

export interface TipPayout {
  id: string;
  number: number;
  from: string;
  to: string;
  amount: number;
  fromCash: boolean;
  notes: string | null;
  createdByName: string;
  createdAt: string;
  shares: TipShare[];
}

export interface TipSummary {
  branchId: string;
  branches: BranchOption[];
  from: string;
  to: string;
  /** Lo recogido en el periodo (sin las propinas de ventas anuladas). */
  collected: number;
  count: number;
  byMethod: TipMethodTotal[];
  /** Todo lo recogido en la sucursal menos todo lo ya repartido. */
  pending: number;
  people: TipPerson[];
  payouts: TipPayout[];
}

export interface TipPayoutInput {
  branchId: string | null;
  from: string;
  to: string;
  amount: number;
  memberIds: string[];
  fromCash: boolean;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class TipsApi {
  private readonly http = inject(HttpClient);

  summary(branchId: string | null, from: string | null, to: string | null): Observable<TipSummary> {
    let params = new HttpParams();
    if (branchId) {
      params = params.set('branchId', branchId);
    }
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    return this.http.get<TipSummary>('/api/v1/tips', { params });
  }

  payout(input: TipPayoutInput): Observable<TipPayout> {
    return this.http.post<TipPayout>('/api/v1/tips/payouts', input);
  }
}
