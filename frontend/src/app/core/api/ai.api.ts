import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { SILENT_CLIENT_ERRORS } from '../errors/error.interceptor';
import { ImportReport } from './api.models';

/** Un mensaje de la conversación con XASKA IA (decisión 296). */
export interface AskTurn {
  role: 'user' | 'assistant';
  text: string;
}

/** Preguntas del mes: {@code limit} 0 = el negocio no tiene XASKA IA. */
export interface AskUsage {
  available: boolean;
  limit: number;
  used: number;
}

export interface AskAnswer {
  answer: string;
  /** Lo que se consultó para responder ("Resumen de ventas"…). */
  consulted: string[];
  usage: AskUsage;
}

/** Punto del Resumen del día (decisión 299). */
export interface DigestPoint {
  section: 'SALES' | 'CASH' | 'INVENTORY' | 'MONEY';
  tone: 'good' | 'warning' | 'bad' | 'info';
  title: string;
  detail: string;
}

export interface Digest {
  date: string;
  headline: string;
  points: DigestPoint[];
  figures: { label: string; value: string }[];
  createdAt: string | null;
}

export interface DigestSettings {
  enabled: boolean;
  /** HH:mm en la zona del negocio. */
  sendTime: string;
  recipients: string[];
  limit: number;
  used: number;
}

/** "Cargar con Aska" (decisión 300): cómo se reconoció un producto que ya existe. */
export type CatalogMatchBy = 'MEMORY' | 'BARCODE' | 'SKU' | 'NAME';
export type CatalogAction = 'CREATE' | 'UPDATE' | 'SKIP';

export interface CatalogMatch {
  productId: string;
  sku: string;
  name: string;
  by: CatalogMatchBy;
  currentCost: number | null;
  currentPrice: number;
  /** El costo lo calcula el inventario (ya tiene movimientos): la lista no lo cambia. */
  costLocked: boolean;
}

export interface CatalogProposal {
  action: CatalogAction;
  sku: string;
  name: string;
  category: string | null;
  unitCode: string;
  taxCode: string;
  /** Sin IVA. */
  cost: number;
  /** Como vende el negocio (con o sin IVA según sus ajustes). */
  price: number;
  marginPercent: number;
}

export interface CatalogRow {
  rowId: number;
  description: string;
  supplierCode: string | null;
  barcode: string | null;
  listCost: number;
  taxRate: number | null;
  match: CatalogMatch | null;
  proposal: CatalogProposal;
}

export interface CatalogOption {
  code: string;
  name: string;
  rate: number | null;
}

export interface CatalogDraft {
  rows: CatalogRow[];
  units: CatalogOption[];
  taxes: CatalogOption[];
  categories: string[];
  pricesIncludeTax: boolean;
  margin: number;
  warnings: string[];
  usage: AskUsage;
}

/** Fila confirmada: {@code productId} nulo = crear. */
export interface CatalogConfirmed {
  productId: string | null;
  sku: string;
  name: string;
  barcode: string | null;
  category: string | null;
  unitCode: string;
  taxCode: string;
  cost: number;
  price: number;
  supplierCode: string | null;
}

@Injectable({ providedIn: 'root' })
export class AiApi {
  private readonly http = inject(HttpClient);

  /**
   * Pregúntale a Aska: la conversación va completa (no se guarda en el servidor). Los 4xx los muestra Aska en su panel,
   * no como aviso arriba.
   */
  ask(question: string, history: AskTurn[]): Observable<AskAnswer> {
    return this.http.post<AskAnswer>('/api/v1/ai/ask', { question, history },
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  usage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/usage');
  }

  /** El último Resumen del día (hoy o ayer) con lo que esta persona puede ver; null si no hay. */
  latestDigest(): Observable<Digest | null> {
    return this.http.get<Digest | null>('/api/v1/ai/digest/latest');
  }

  digestSettings(): Observable<DigestSettings> {
    return this.http.get<DigestSettings>('/api/v1/ai/digest/settings');
  }

  saveDigestSettings(enabled: boolean, sendTime: string, recipients: string[]): Observable<DigestSettings> {
    return this.http.put<DigestSettings>('/api/v1/ai/digest/settings', { enabled, sendTime, recipients });
  }

  /** Arma y envía el resumen ahora (reemplaza el del día). */
  runDigest(): Observable<Digest> {
    return this.http.post<Digest>('/api/v1/ai/digest/run', {});
  }

  /** Aska lee la lista de precios del proveedor; nada se guarda. Los 4xx se muestran en la pantalla. */
  readCatalog(files: File[], supplierId: string | null, margin: number): Observable<CatalogDraft> {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    if (supplierId) {
      form.append('supplierId', supplierId);
    }
    form.append('margin', String(margin));
    return this.http.post<CatalogDraft>('/api/v1/ai/catalog/read', form,
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  applyCatalog(rows: CatalogConfirmed[], supplierId: string | null): Observable<ImportReport> {
    return this.http.post<ImportReport>('/api/v1/ai/catalog/apply', { supplierId, rows });
  }

  catalogUsage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/catalog/usage');
  }
}
