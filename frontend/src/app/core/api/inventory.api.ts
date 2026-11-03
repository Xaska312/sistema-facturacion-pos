import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import {
  InventoryDocument,
  InventoryDocumentType,
  InventoryLineInput,
  KardexRow,
  MovementType,
  PageResponse,
  ProductLookup,
  StockAlert,
  StockRow,
} from './api.models';
import { PageQuery, pageParams } from './organization.api';

export interface DocumentInput {
  branchId: string;
  /** Solo traslados. */
  toBranchId?: string | null;
  /** Solo bajas (acta): cómo se dispuso y quién lo presenció. */
  disposalMethod?: string | null;
  witnessName?: string | null;
  reason?: string | null;
  notes?: string | null;
  lines: InventoryLineInput[];
}

const DOCUMENT_PATH: Record<InventoryDocumentType, string> = {
  INITIAL: 'initial-balances',
  ADJUSTMENT: 'adjustments',
  TRANSFER: 'transfers',
  COUNT: 'counts',
  DISPOSAL: 'disposals',
};

export type LotStatus = 'EXPIRED' | 'EXPIRING' | 'OK';

/** Un lote con existencia en una sucursal (Fase 13-3). */
export interface LotRow {
  branchId: string;
  branchName: string | null;
  productId: string;
  sku: string;
  name: string;
  unitCode: string;
  lotId: string;
  lotNumber: string;
  expirationDate: string | null;
  quantity: number;
  value: number;
  daysLeft: number | null;
  status: LotStatus;
}

export interface LotSummary {
  alertMonths: number;
  expiredLots: number;
  expiredValue: number;
  expiringLots: number;
  expiringValue: number;
  unlottedProducts: number;
}

export interface UnlottedRow {
  branchId: string;
  branchName: string | null;
  productId: string;
  sku: string;
  name: string;
  unitCode: string;
  quantity: number;
}

export interface ProductLots {
  productId: string;
  branchId: string;
  unlotted: number;
  lots: LotRow[];
}

export interface TraceEntry {
  at: string;
  branchName: string | null;
  type: MovementType;
  quantity: number;
  document: string | null;
  party: string | null;
  reason: string | null;
}

export interface LotTrace {
  productId: string;
  sku: string;
  name: string;
  unitCode: string;
  lotNumber: string;
  expirationDate: string | null;
  onHand: number;
  received: number;
  sold: number;
  entries: TraceEntry[];
}

/** Inventario: existencias, alertas, kardex y documentos. */
@Injectable({ providedIn: 'root' })
export class InventoryApi {
  private readonly http = inject(HttpClient);

  stock(branchId: string, query: PageQuery, search: string | null): Observable<PageResponse<StockRow>> {
    return this.http.get<PageResponse<StockRow>>('/api/v1/inventory/stock', {
      params: pageParams(query, { branchId, search }),
    });
  }

  balance(branchId: string, productId: string): Observable<StockRow> {
    return this.http.get<StockRow>('/api/v1/inventory/balance', { params: { branchId, productId } });
  }

  /** Saldos de varios productos en una sucursal (las tallas de un modelo, fase 8d). Máximo 500. */
  balances(branchId: string, productIds: string[]): Observable<StockRow[]> {
    return this.http.get<StockRow[]>('/api/v1/inventory/balances', {
      params: new HttpParams().set('branchId', branchId).set('productIds', productIds.join(',')),
    });
  }

  alerts(branchId: string | null): Observable<StockAlert[]> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : new HttpParams();
    return this.http.get<StockAlert[]>('/api/v1/inventory/alerts', { params });
  }

  setLevels(branchId: string, productId: string, minStock: number | null, maxStock: number | null): Observable<StockRow> {
    return this.http.put<StockRow>('/api/v1/inventory/stock-levels', { branchId, productId, minStock, maxStock });
  }

  kardex(productId: string, branchId: string | null, from: string | null, to: string | null,
         page: number, size = 50): Observable<PageResponse<KardexRow>> {
    return this.http.get<PageResponse<KardexRow>>('/api/v1/inventory/kardex', {
      params: pageParams({ page, size }, { productId, branchId, from, to }),
    });
  }

  documents(type: InventoryDocumentType | null, branchId: string | null, page: number,
            size = 20): Observable<PageResponse<InventoryDocument>> {
    return this.http.get<PageResponse<InventoryDocument>>('/api/v1/inventory/documents', {
      params: pageParams({ page, size }, { type, branchId }),
    });
  }

  document(id: string): Observable<InventoryDocument> {
    return this.http.get<InventoryDocument>(`/api/v1/inventory/documents/${id}`);
  }

  /** Registra un documento. La clave de idempotencia evita duplicados si se reintenta el envío. */
  create(type: InventoryDocumentType, input: DocumentInput, idempotencyKey: string): Observable<InventoryDocument> {
    const body =
      type === 'TRANSFER'
        ? { fromBranchId: input.branchId, toBranchId: input.toBranchId, notes: input.notes, lines: input.lines }
        : type === 'DISPOSAL'
          ? { branchId: input.branchId, reason: input.reason, notes: input.notes, lines: input.lines,
            disposalMethod: input.disposalMethod, witnessName: input.witnessName }
          : { branchId: input.branchId, reason: input.reason, notes: input.notes, lines: input.lines };
    return this.http.post<InventoryDocument>(`/api/v1/inventory/${DOCUMENT_PATH[type]}`, body, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  // ------------------------------------------------------------- lotes y vencimientos (Fase 13-3)

  lots(branchId: string | null, status: LotStatus | null, search: string | null, query: PageQuery):
    Observable<PageResponse<LotRow>> {
    return this.http.get<PageResponse<LotRow>>('/api/v1/inventory/lots', {
      params: pageParams(query, { branchId, status, search }),
    });
  }

  lotSummary(branchId: string | null): Observable<LotSummary> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : new HttpParams();
    return this.http.get<LotSummary>('/api/v1/inventory/lots/summary', { params });
  }

  unlotted(branchId: string | null): Observable<UnlottedRow[]> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : new HttpParams();
    return this.http.get<UnlottedRow[]>('/api/v1/inventory/lots/unlotted', { params });
  }

  productLots(productId: string, branchId: string): Observable<ProductLots> {
    return this.http.get<ProductLots>('/api/v1/inventory/lots/product', { params: { productId, branchId } });
  }

  trace(productId: string, lot: string): Observable<LotTrace> {
    return this.http.get<LotTrace>('/api/v1/inventory/lots/trace', { params: { productId, lot } });
  }

  lookup(code: string): Observable<ProductLookup> {
    // Un código que no existe no es un error para el usuario: el editor busca entonces por nombre.
    return this.http.get<ProductLookup>('/api/v1/products/lookup', {
      params: { code },
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, true),
    });
  }
}
