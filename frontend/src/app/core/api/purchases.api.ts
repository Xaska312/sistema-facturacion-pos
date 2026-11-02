import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

export type PurchasePaymentType = 'PAID' | 'CREDIT';
export type PurchaseLineStatus = 'ACCEPTED' | 'REJECTED';

/** Una compra en listas: lo pagado, el saldo y si está vencida. */
export interface PurchaseSummary {
  id: string;
  number: number;
  branchId: string;
  branchName: string | null;
  supplierId: string;
  supplierName: string | null;
  supplierInvoice: string;
  invoiceDate: string;
  paymentType: PurchasePaymentType;
  dueDate: string | null;
  total: number;
  paid: number;
  balance: number;
  overdue: boolean;
  rejectedTotal: number;
  receivedAt: string;
  receivedByName: string | null;
  lineCount: number;
}

export interface PurchaseLine {
  lineNo: number;
  productId: string;
  productName: string;
  sku: string;
  unitCode: string | null;
  quantity: number;
  unitCost: number;
  taxRate: number;
  lineTotal: number;
  lotNumber: string | null;
  expirationDate: string | null;
  sanitaryRegistration: string | null;
  status: PurchaseLineStatus;
  rejectReason: string | null;
  baseQuantity: number;
}

export interface SupplierPayment {
  id: string;
  amount: number;
  methodName: string | null;
  fromCash: boolean;
  reference: string | null;
  paidAt: string;
  paidByName: string | null;
}

export interface PurchaseReceipt {
  summary: PurchaseSummary;
  subtotal: number;
  taxTotal: number;
  coldChainTemperature: number | null;
  notes: string | null;
  checksConfirmed: boolean;
  lines: PurchaseLine[];
  payments: SupplierPayment[];
}

/** Cuentas por pagar: lo que se debe, lo vencido, lo que vence en 7 días y las facturas con saldo. */
export interface Payables {
  totalDue: number;
  overdue: number;
  dueSoon: number;
  receipts: PurchaseSummary[];
}

export interface PurchaseLineInput {
  productId: string;
  unitId: string | null;
  quantity: number;
  /** Costo por unidad elegida, antes de IVA. */
  unitCost: number;
  taxRate: number;
  lotNumber: string | null;
  expirationDate: string | null;
  status: PurchaseLineStatus;
  rejectReason: string | null;
}

export interface PurchaseInput {
  branchId: string;
  supplierId: string;
  supplierInvoice: string;
  invoiceDate: string;
  paymentType: PurchasePaymentType;
  paymentMethodId: string | null;
  dueDate: string | null;
  paymentReference: string | null;
  checksConfirmed: boolean;
  coldChainTemperature: number | null;
  notes: string | null;
  lines: PurchaseLineInput[];
}

export interface SupplierPaymentInput {
  amount: number;
  paymentMethodId: string;
  reference: string | null;
}

/** Compras (Fase 13-2, decisión 280): recepción contra factura, cuentas por pagar y pagos a proveedores. */
@Injectable({ providedIn: 'root' })
export class PurchasesApi {
  private readonly http = inject(HttpClient);

  list(query: PageQuery, supplierId: string | null): Observable<PageResponse<PurchaseSummary>> {
    return this.http.get<PageResponse<PurchaseSummary>>('/api/v1/purchases', { params: pageParams(query, { supplierId }) });
  }

  get(id: string): Observable<PurchaseReceipt> {
    return this.http.get<PurchaseReceipt>(`/api/v1/purchases/${id}`);
  }

  payables(): Observable<Payables> {
    return this.http.get<Payables>('/api/v1/purchases/payables');
  }

  /** La clave evita registrar dos veces la misma recepción si se reintenta. */
  receive(input: PurchaseInput, idempotencyKey: string): Observable<PurchaseReceipt> {
    return this.http.post<PurchaseReceipt>('/api/v1/purchases', input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  pay(id: string, input: SupplierPaymentInput, idempotencyKey: string): Observable<SupplierPayment> {
    return this.http.post<SupplierPayment>(`/api/v1/purchases/${id}/payments`, input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }
}
