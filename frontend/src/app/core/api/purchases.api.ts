import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
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
  /** Devuelto al proveedor (Fase 13-3): baja el saldo; si ya estaba pagado queda a favor. */
  returnedTotal: number;
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
  /** Ya devuelto al proveedor, en la unidad de la línea. */
  returnedQuantity: number;
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
  returns: PurchaseReturn[];
  /** La factura del proveedor guardada como soporte (decisión 290). */
  document: PurchaseDocumentRef | null;
}

export interface PurchaseDocumentRef {
  id: string;
  fileName: string;
  kind: 'XML' | 'ZIP' | 'PDF' | 'IMAGE';
}

/** Cómo se encontró el producto de una línea de la factura: MEMORY (aprendido), BARCODE, SKU o NAME (revisar). */
export type InvoiceMatchBy = 'MEMORY' | 'BARCODE' | 'SKU' | 'NAME';

export interface InvoiceDraftLine {
  lineNo: number;
  description: string;
  supplierCode: string | null;
  barcode: string | null;
  unitCode: string | null;
  /** La factura viene por caja, paquete…: hay que elegir la presentación. */
  packageUnit: boolean;
  quantity: number;
  /** Sin IVA y con el descuento de la línea. */
  unitCost: number;
  taxRate: number;
  discount: number;
  lotNumber: string | null;
  expirationDate: string | null;
  match: { productId: string; unitId: string | null; by: InvoiceMatchBy; lastCost: number | null } | null;
  candidates: { productId: string; name: string; sku: string }[];
}

/** Borrador que sale de la factura cargada: nada queda registrado hasta confirmar la recepción. */
export interface InvoiceDraft {
  documentId: string;
  kind: PurchaseDocumentRef['kind'];
  fileName: string;
  supplier: { id: string | null; name: string | null; documentNumber: string | null; verificationDigit: number | null;
    active: boolean };
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate: string | null;
  paymentType: PurchasePaymentType | null;
  cufe: string | null;
  subtotal: number | null;
  taxTotal: number | null;
  total: number | null;
  alreadyRegistered: boolean;
  lines: InvoiceDraftLine[];
  warnings: string[];
}

/** Lecturas con IA del mes (decisión 295): {@code limit} nulo = sin límite; {@code available}: la IA está encendida. */
export interface InvoiceScanUsage {
  available: boolean;
  limit: number | null;
  used: number;
}

export interface PurchaseReturn {
  id: string;
  number: number;
  reason: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  createdAt: string;
  createdByName: string | null;
  lines: { receiptLineNo: number; productId: string; productName: string; unitCode: string | null; quantity: number;
    lotNumber: string | null; lineTotal: number }[];
}

export interface PurchaseReturnInput {
  reason: string;
  lines: { receiptLineNo: number; quantity: number }[];
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
  /** Código de la línea en la factura del proveedor: se recuerda para la próxima (decisión 290). */
  supplierCode?: string | null;
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
  documentId?: string | null;
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

  /** Devolución al proveedor (Fase 13-3): sale del lote recibido y baja lo que se le debe. */
  returnGoods(id: string, input: PurchaseReturnInput, idempotencyKey: string): Observable<PurchaseReceipt> {
    return this.http.post<PurchaseReceipt>(`/api/v1/purchases/${id}/returns`, input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  /** Carga la factura del proveedor (XML o ZIP de la factura electrónica) y devuelve el borrador para revisar. */
  importInvoice(file: File): Observable<InvoiceDraft> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<InvoiceDraft>('/api/v1/purchases/documents', form);
  }

  /**
   * La factura en fotos (hasta 5) o en PDF leída con IA (decisión 295): el mismo borrador que el XML. Solo cuenta en el
   * tope del mes si se pudo leer.
   */
  scanInvoice(files: File[]): Observable<InvoiceDraft> {
    const form = new FormData();
    for (const f of files) {
      form.append('files', f, f.name);
    }
    return this.http.post<InvoiceDraft>('/api/v1/purchases/documents/scan', form);
  }

  scanUsage(): Observable<InvoiceScanUsage> {
    return this.http.get<InvoiceScanUsage>('/api/v1/purchases/documents/scan-usage');
  }

  /** El archivo de soporte (para descargarlo). */
  documentFile(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/api/v1/purchases/documents/${id}/file`, { responseType: 'blob', observe: 'response' });
  }

  pay(id: string, input: SupplierPaymentInput, idempotencyKey: string): Observable<SupplierPayment> {
    return this.http.post<SupplierPayment>(`/api/v1/purchases/${id}/payments`, input, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }
}
