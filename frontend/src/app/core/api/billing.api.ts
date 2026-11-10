import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { BillingCycle, Subscription } from './api.models';

/** Planes y pagos con Bre-B (decisión 302). */
export interface BillingPlan {
  code: string;
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  maxBranches: number | null;
  maxUsers: number | null;
  maxRegisters: number | null;
  modules: string[];
  features: string[];
  /** Su plan anterior a su precio fundador (decisión 305): solo para ese negocio y mientras le dure. */
  founder: boolean;
}

export type AddonKind = 'FEATURE' | 'MODULE' | 'BRANCH' | 'REGISTER' | 'USER';

export interface BillingAddon {
  code: string;
  kind: AddonKind;
  ref: string | null;
  name: string;
  description: string;
  monthlyPrice: number | null;
  active: boolean;
  sortOrder: number;
}

export interface Breb {
  key: string;
  holderName: string;
  bankName: string;
  notes: string;
  ready: boolean;
  /** Hay imagen del QR del banco (decisión 303). */
  hasQr: boolean;
}

export interface PublicPricing {
  plans: BillingPlan[];
  addons: BillingAddon[];
  trialDays: number;
}

export interface ProofCheck {
  readable: boolean;
  amount: number;
  reference: string;
  date: string;
  destination: string;
  successful: boolean;
  amountOk: boolean;
  referenceOk: boolean;
  destinationOk: boolean;
  note: string;
}

export type PaymentRequestStatus = 'PENDING' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PaymentRequestView {
  id: string;
  tenantId: string;
  tradeName: string;
  reference: string;
  status: PaymentRequestStatus;
  planCode: string | null;
  planName: string | null;
  billingCycle: BillingCycle;
  periods: number;
  months: number;
  planAmount: number;
  items: { code: string; name: string; quantity: number; months: number; unitPrice: number; amount: number }[];
  amount: number;
  createdAt: string;
  expiresAt: string;
  proofAt: string | null;
  proofType: string | null;
  check: ProofCheck | null;
  rejectReason: string | null;
  reviewedAt: string | null;
}

export interface BillingCatalog {
  plans: BillingPlan[];
  addons: BillingAddon[];
  breb: Breb;
  subscription: Subscription;
  requests: PaymentRequestView[];
}

export interface BillingOrder {
  planCode: string | null;
  billingCycle: BillingCycle;
  periods: number;
  addons: { code: string; quantity: number }[];
}

export interface AiTeaser {
  show: boolean;
  lowStock: number;
  slowProducts: number;
  slowValue: number;
  canBuy: boolean;
}

/** "Invita y gana" (decisión 312). */
export interface ReferralInvited {
  tradeName: string;
  status: 'PENDING' | 'QUALIFIED';
  createdAt: string;
  qualifiedAt: string | null;
}

export interface MyReferrals {
  code: string;
  link: string;
  invited: number;
  paid: number;
  monthsEarned: number;
  list: ReferralInvited[];
}

/** Aliados (contadores y distribuidores) y referidos en la Consola (decisión 312). */
export type PartnerKind = 'ACCOUNTANT' | 'DISTRIBUTOR';

export interface Partner {
  id: string;
  name: string;
  kind: PartnerKind;
  phone: string | null;
  email: string | null;
  payoutKey: string | null;
  note: string | null;
  active: boolean;
  code: string | null;
  referred: number;
  paid: number;
  commissionOwed: number;
}

export interface PartnerInput {
  name: string;
  kind: PartnerKind;
  phone: string | null;
  email: string | null;
  payoutKey: string | null;
  note: string | null;
  active: boolean;
}

export interface ReferralRow {
  referredTenantId: string;
  referredName: string;
  code: string;
  referrerName: string | null;
  partnerName: string | null;
  partnerPayoutKey: string | null;
  status: 'PENDING' | 'QUALIFIED';
  createdAt: string;
  qualifiedAt: string | null;
  firstAmount: number | null;
  commission: number | null;
  paidAt: string | null;
  paidReference: string | null;
}

@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  referrals(): Observable<MyReferrals> {
    return this.http.get<MyReferrals>('/api/v1/billing/referrals');
  }

  adminPartners(): Observable<Partner[]> {
    return this.http.get<Partner[]>('/api/v1/platform/partners');
  }

  savePartner(id: string | null, input: PartnerInput): Observable<Partner> {
    return id ? this.http.put<Partner>(`/api/v1/platform/partners/${id}`, input)
      : this.http.post<Partner>('/api/v1/platform/partners', input);
  }

  adminReferrals(): Observable<ReferralRow[]> {
    return this.http.get<ReferralRow[]>('/api/v1/platform/referrals');
  }

  markCommissionPaid(tenantId: string, reference: string): Observable<ReferralRow> {
    return this.http.post<ReferralRow>(`/api/v1/platform/referrals/${tenantId}/paid`, { reference });
  }

  catalog(): Observable<BillingCatalog> {
    return this.http.get<BillingCatalog>('/api/v1/billing');
  }

  createRequest(order: BillingOrder): Observable<PaymentRequestView> {
    return this.http.post<PaymentRequestView>('/api/v1/billing/requests', order);
  }

  cancel(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/billing/requests/${id}`);
  }

  uploadProof(id: string, file: File): Observable<PaymentRequestView> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<PaymentRequestView>(`/api/v1/billing/requests/${id}/proof`, form);
  }

  /** El QR de la llave Bre-B de XASKA. */
  qr(): Observable<Blob> {
    return this.http.get('/api/v1/billing/qr', { responseType: 'blob' });
  }

  /** Planes y precios sin iniciar sesión (decisión 303). */
  pricing(): Observable<PublicPricing> {
    return this.http.get<PublicPricing>('/api/v1/public/pricing');
  }

  startAiTrial(): Observable<Subscription> {
    return this.http.post<Subscription>('/api/v1/billing/ai-trial', {});
  }

  /** "Aska encontró…" en Inicio; sin aviso si falla. */
  teaser(): Observable<AiTeaser> {
    return this.http.get<AiTeaser>('/api/v1/ai/teaser', { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  // ---------------------------------------------------------------- consola

  adminRequests(status: PaymentRequestStatus | null): Observable<PaymentRequestView[]> {
    return this.http.get<PaymentRequestView[]>('/api/v1/platform/billing/requests',
      { params: status ? { status } : {} });
  }

  adminPending(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>('/api/v1/platform/billing/pending');
  }

  adminProof(id: string): Observable<Blob> {
    return this.http.get(`/api/v1/platform/billing/requests/${id}/proof`, { responseType: 'blob' });
  }

  approve(id: string): Observable<PaymentRequestView> {
    return this.http.post<PaymentRequestView>(`/api/v1/platform/billing/requests/${id}/approve`, {});
  }

  reject(id: string, reason: string): Observable<PaymentRequestView> {
    return this.http.post<PaymentRequestView>(`/api/v1/platform/billing/requests/${id}/reject`, { reason });
  }

  breb(): Observable<Breb> {
    return this.http.get<Breb>('/api/v1/platform/billing/breb');
  }

  saveBreb(input: { key: string; holderName: string; bankName: string; notes: string }): Observable<Breb> {
    return this.http.put<Breb>('/api/v1/platform/billing/breb', input);
  }

  saveQr(file: File): Observable<Breb> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.put<Breb>('/api/v1/platform/billing/breb/qr', form);
  }

  deleteQr(): Observable<Breb> {
    return this.http.delete<Breb>('/api/v1/platform/billing/breb/qr');
  }

  adminAddons(): Observable<BillingAddon[]> {
    return this.http.get<BillingAddon[]>('/api/v1/platform/billing/addons');
  }

  updateAddon(code: string, input: { name: string; description: string; monthlyPrice: number | null; active: boolean }):
  Observable<BillingAddon> {
    return this.http.put<BillingAddon>(`/api/v1/platform/billing/addons/${code}`, input);
  }
}
