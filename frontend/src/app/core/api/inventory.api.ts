import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import {
  InventoryDocument,
  InventoryDocumentType,
  InventoryLineInput,
  KardexRow,
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
  reason?: string | null;
  notes?: string | null;
  lines: InventoryLineInput[];
}

const DOCUMENT_PATH: Record<InventoryDocumentType, string> = {
  INITIAL: 'initial-balances',
  ADJUSTMENT: 'adjustments',
  TRANSFER: 'transfers',
  COUNT: 'counts',
};

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
        : { branchId: input.branchId, reason: input.reason, notes: input.notes, lines: input.lines };
    return this.http.post<InventoryDocument>(`/api/v1/inventory/${DOCUMENT_PATH[type]}`, body, {
      headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
    });
  }

  lookup(code: string): Observable<ProductLookup> {
    // Un código que no existe no es un error para el usuario: el editor busca entonces por nombre.
    return this.http.get<ProductLookup>('/api/v1/products/lookup', {
      params: { code },
      context: new HttpContext().set(SILENT_CLIENT_ERRORS, true),
    });
  }
}
