import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivationCode, BusinessType, CodeInput, CreatedCodes, PageResponse, PaymentInput, Plan, PlanInput, Subscription, SubscriptionRow,
  SubscriptionStatus, TenantStatus, TenantSummary,
} from './api.models';

/** Negocio en la consola de plataforma. */
export interface PlatformTenant {
  id: string;
  slug: string;
  legalName: string;
  tradeName: string;
  businessType: BusinessType;
  status: TenantStatus;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  activeMembers: number;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  closedByOwner: boolean;
  /** Eliminado definitivamente (decisión 262). */
  deletedAt: string | null;
  deletionReason: string | null;
}

export interface SecurityEvent {
  id: string;
  occurredAt: string;
  event: string;
  userId: string | null;
  email: string | null;
  userName: string | null;
  tenantId: string | null;
  tenantName: string | null;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
}

export interface SecurityEventFilters {
  /** AAAA-MM-DD (calendario local); se envía como instante ISO al inicio del día. */
  from: string | null;
  /** AAAA-MM-DD incluido; se envía como el inicio del día siguiente. */
  to: string | null;
  event: string | null;
  /** Correo o IP. */
  q: string | null;
}

/** Consola de plataforma (solo administradores; el backend lo exige en cada petición). */
@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/platform';

  tenants(q: string | null, status: TenantStatus | null, page: number, size: number):
    Observable<PageResponse<PlatformTenant>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (q?.trim()) {
      params = params.set('q', q.trim());
    }
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PageResponse<PlatformTenant>>(`${this.base}/tenants`, { params });
  }

  suspend(tenantId: string, reason: string): Observable<TenantSummary> {
    return this.http.post<TenantSummary>(`${this.base}/tenants/${tenantId}/suspend`, { reason });
  }

  /** Eliminación definitiva de un negocio suspendido: borra todos sus datos (decisión 262). */
  deleteTenant(tenantId: string, confirmation: string, password: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/tenants/${tenantId}/delete`, { confirmation, password, reason });
  }

  /** Tipo de negocio, también los "Pronto" para pilotos (Fase 12a); el negocio queda con los módulos del tipo. */
  setBusinessType(tenantId: string, businessType: BusinessType): Observable<TenantSummary> {
    return this.http.put<TenantSummary>(`${this.base}/tenants/${tenantId}/business-type`, { businessType });
  }

  reactivate(tenantId: string): Observable<TenantSummary> {
    return this.http.post<TenantSummary>(`${this.base}/tenants/${tenantId}/reactivate`, {});
  }

  securityEvents(filters: SecurityEventFilters, page: number, size: number): Observable<PageResponse<SecurityEvent>> {
    let params = new HttpParams().set('page', page).set('size', size);
    const range = eventRange(filters.from, filters.to);
    if (range.from) {
      params = params.set('from', range.from);
    }
    if (range.to) {
      params = params.set('to', range.to);
    }
    if (filters.event) {
      params = params.set('event', filters.event);
    }
    if (filters.q?.trim()) {
      params = params.set('q', filters.q.trim());
    }
    return this.http.get<PageResponse<SecurityEvent>>(`${this.base}/security-events`, { params });
  }

  // ---------------------------------------------------------------- suscripciones (fase 8b)

  plans(): Observable<Plan[]> {
    return this.http.get<Plan[]>(`${this.base}/plans`);
  }

  updatePlan(code: string, input: PlanInput): Observable<Plan> {
    return this.http.put<Plan>(`${this.base}/plans/${encodeURIComponent(code)}`, input);
  }

  subscriptions(q: string | null, status: SubscriptionStatus | null, page: number, size: number)
    : Observable<PageResponse<SubscriptionRow>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (q?.trim()) {
      params = params.set('q', q.trim());
    }
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PageResponse<SubscriptionRow>>(`${this.base}/subscriptions`, { params });
  }

  subscription(tenantId: string): Observable<Subscription> {
    return this.http.get<Subscription>(`${this.base}/tenants/${tenantId}/subscription`);
  }

  registerPayment(tenantId: string, input: PaymentInput): Observable<Subscription> {
    return this.http.post<Subscription>(`${this.base}/tenants/${tenantId}/subscription/payments`, input);
  }

  changePlan(tenantId: string, planCode: string): Observable<Subscription> {
    return this.http.put<Subscription>(`${this.base}/tenants/${tenantId}/subscription/plan`, { planCode });
  }

  codes(): Observable<ActivationCode[]> {
    return this.http.get<ActivationCode[]>(`${this.base}/activation-codes`);
  }

  createCodes(input: CodeInput): Observable<CreatedCodes> {
    return this.http.post<CreatedCodes>(`${this.base}/activation-codes`, input);
  }

  revokeCode(id: string): Observable<ActivationCode> {
    return this.http.post<ActivationCode>(`${this.base}/activation-codes/${id}/revoke`, {});
  }
}

/** Fechas AAAA-MM-DD del calendario local → instantes ISO (desde el inicio del día; hasta el inicio del siguiente). */
export function eventRange(from: string | null, to: string | null): { from: string | null; to: string | null } {
  return { from: from ? localDayStart(from, 0) : null, to: to ? localDayStart(to, 1) : null };
}

function localDayStart(iso: string, plusDays: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + plusDays);
  return date.toISOString();
}
