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
  /** FINANCE (decisión 325): gastos del día, ganancia del día y gastos fijos por vencer. */
  section: 'SALES' | 'CASH' | 'INVENTORY' | 'MONEY' | 'FINANCE';
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
  /** El clima del día (decisión 307); null si esta persona no ve las ventas o el resumen es anterior. */
  weather?: DigestWeatherCode | null;
  /** Lo que suele pasar mañana según el mismo día de las últimas semanas. */
  forecast?: string | null;
  /** Hasta 2 preguntas para seguir la conversación con Aska. */
  followUps?: string[];
}

export type DigestWeatherCode = 'SUNNY' | 'PARTLY' | 'CLOUDY' | 'RAIN' | 'STORM' | 'QUIET';

/** Aska en el momento del dolor (decisión 308). */
export interface AskaMoments {
  /** El negocio tiene XASKA IA (pagada o en prueba). */
  hasAi: boolean;
  /** Quien mira puede activarla (el dueño). */
  canBuy: boolean;
  /** Puede empezar la prueba gratis. */
  trialAvailable: boolean;
  /** Hay productos pero casi ninguno tiene existencias. */
  emptyStock: boolean;
}

/** "Lo que hiciste con Aska" (decisión 309): el mes pasado, con el tiempo ahorrado estimado. */
export interface AskaRecap {
  title: string;
  from: string;
  to: string;
  invoices: number;
  invoiceLines: number;
  products: number;
  questions: number;
  reviews: number;
  digests: number;
  minutesSaved: number;
  savedLabel: string;
  /** Recibos de gastos leídos con foto (decisión 325). */
  receipts?: number;
}

/**
 * "Leer con Aska" en el gasto (decisión 325): lo que se leyó del recibo; lo que no se vio va null. Nada se guarda.
 * supplierId: el proveedor ya creado con ese NIT o nombre.
 */
export interface ExpenseReceiptRead {
  amount: number | null;
  date: string | null;
  categoryId: string | null;
  categoryName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierDocument: string | null;
  reference: string | null;
  note: string | null;
  warnings: string[];
  usage: AskUsage;
}

/** La prueba gratis de XASKA IA (decisión 311): días que quedan y los tres retos de la bienvenida. */
export interface AiTrial {
  endsAt: string;
  daysLeft: number;
  scanned: boolean;
  asked: boolean;
  loaded: boolean;
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
  /** Como vende el negocio (con o sin IVA según sus ajustes); nulo si la lista no lo trae (decisión 313). */
  price: number | null;
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
  /** Modo inventario (decisión 306): lo que hay, para el saldo inicial; null si no aplica. */
  quantity: number | null;
  /** Por qué no se le pone saldo inicial (ya tiene movimientos en esa sede). */
  stockNote: string | null;
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
  inventory: boolean;
  branchId: string | null;
  /** Decisión 313: un Word con más fotos de las que Aska lee por vez; qué tanda se leyó. */
  photos?: { from: number; to: number; total: number } | null;
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
  quantity: number | null;
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
  /** Decisión 308: si el negocio tiene XASKA IA y si el inventario está vacío (no usa la IA). */
  moments(): Observable<AskaMoments> {
    return this.http.get<AskaMoments>('/api/v1/ai/moments', { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  /** Decisión 309: lo del mes pasado, solo los primeros 7 días del mes (204 → null). Para el dueño. */
  recap(): Observable<AskaRecap | null> {
    return this.http.get<AskaRecap | null>('/api/v1/ai/recap', { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  /** Decisión 311: la prueba de XASKA IA en curso; null si el negocio no está en prueba (204). */
  trial(): Observable<AiTrial | null> {
    return this.http.get<AiTrial | null>('/api/v1/ai/trial', { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

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
  readCatalog(files: File[], supplierId: string | null, margin: number, branchId: string | null = null,
              fromPhoto = 1): Observable<CatalogDraft> {
    const form = new FormData();
    if (fromPhoto > 1) {
      // Decisión 313: la siguiente tanda de fotos de un Word.
      form.append('fromPhoto', String(fromPhoto));
    }
    files.forEach((f) => form.append('files', f, f.name));
    if (supplierId) {
      form.append('supplierId', supplierId);
    }
    if (branchId) {
      // Modo inventario (decisión 306): cuaderno, hojas o Excel con cantidades.
      form.append('inventory', 'true');
      form.append('branchId', branchId);
    }
    form.append('margin', String(margin));
    return this.http.post<CatalogDraft>('/api/v1/ai/catalog/read', form,
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  applyCatalog(rows: CatalogConfirmed[], supplierId: string | null, branchId: string | null = null):
  Observable<{ report: ImportReport; stocked: number }> {
    return this.http.post<{ report: ImportReport; stocked: number }>('/api/v1/ai/catalog/apply',
      { supplierId, branchId, rows });
  }

  catalogUsage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/catalog/usage');
  }

  /** Aska lee la foto o el PDF del recibo de un gasto (decisión 325). Los 4xx se muestran en el formulario. */
  readExpenseReceipt(file: File): Observable<ExpenseReceiptRead> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ExpenseReceiptRead>('/api/v1/ai/expenses/read', form,
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }

  /** Recibos leídos este mes; los errores no se muestran (sin XASKA IA el botón no aparece). */
  expenseReceiptUsage(): Observable<AskUsage> {
    return this.http.get<AskUsage>('/api/v1/ai/expenses/usage',
      { context: new HttpContext().set(SILENT_CLIENT_ERRORS, true) });
  }
}
