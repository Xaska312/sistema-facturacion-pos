import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';
import { LotRow } from './inventory.api';
import { SILENT_ALL_ERRORS } from '../errors/error.interceptor';

/** Un producto del carrito que se vende con fórmula (Fase 13-4). {@code strict}: antibiótico o control especial. */
export interface DispensingInfo {
  productId: string;
  saleCondition: string;
  antibiotic: boolean;
  strict: boolean;
}

/** Lo que el POS envía con la venta: fórmula vista y, en antibióticos y control especial, sus datos. */
export interface DispensationInput {
  prescriptionSeen: boolean;
  prescriberName: string | null;
  prescriberLicense: string | null;
  prescriptionDate: string | null;
  patientDocument: string | null;
  patientName: string | null;
}

export type Profession = 'PHARMACIST' | 'PHARMACY_REGENT' | 'PHARMACY_TECHNICIAN';

export interface TechnicalDirector {
  name: string | null;
  profession: Profession | null;
  license: string | null;
}

export interface DispensationLine {
  productName: string;
  sku: string;
  quantity: number;
  unitCode: string;
  saleCondition: string;
  antibiotic: boolean;
  lots: string | null;
}

export interface Dispensation {
  saleId: string;
  saleNumber: string;
  dispensedAt: string;
  branchName: string | null;
  dispensedByName: string | null;
  antibiotic: boolean;
  controlled: boolean;
  prescriberName: string | null;
  prescriberLicense: string | null;
  prescriptionDate: string | null;
  patientDocument: string | null;
  patientName: string | null;
  voided: boolean;
  lines: DispensationLine[];
}


// ------------------------------------------------------------------ calidad (Fase 13-6, decisión 287)

export type QualityKind = 'ROOM' | 'FRIDGE';
export type QualityShift = 'MORNING' | 'AFTERNOON';

/** Punto de control: el local (termohigrómetro) o una nevera (cadena de frío, sin humedad). */
export interface QualityPoint {
  id: string;
  branchId: string;
  name: string;
  kind: QualityKind;
  tempMin: number;
  tempMax: number;
  humidityMin: number | null;
  humidityMax: number | null;
  active: boolean;
}

export interface QualityPointInput {
  name: string;
  kind: QualityKind;
  tempMin: number;
  tempMax: number;
  humidityMin: number | null;
  humidityMax: number | null;
  active?: boolean;
}

export interface QualityReading {
  id: string;
  pointId: string;
  pointName: string;
  date: string;
  shift: QualityShift;
  temperature: number;
  humidity: number | null;
  outOfRange: boolean;
  actionTaken: string | null;
  recordedByName: string | null;
  recordedAt: string;
}

export interface QualityToday {
  branchId: string;
  branches: { id: string; name: string }[];
  date: string;
  shift: QualityShift;
  afternoonOpen: boolean;
  points: { point: QualityPoint; morning: QualityReading | null; afternoon: QualityReading | null }[];
  /** "Nevera · mañana". */
  missing: string[];
}

export interface AdverseEvent {
  id: string;
  number: number;
  branchId: string;
  branchName: string | null;
  occurredOn: string;
  patientName: string;
  patientDocument: string | null;
  patientAge: number | null;
  productId: string | null;
  productName: string;
  lotNumber: string | null;
  description: string;
  serious: boolean;
  reportedOn: string | null;
  invimaReference: string | null;
  recordedByName: string | null;
  recordedAt: string;
}

export interface AdverseEventInput {
  branchId: string | null;
  occurredOn: string;
  patientName: string;
  patientDocument: string | null;
  patientAge: number | null;
  productId: string | null;
  productName: string | null;
  lotNumber: string | null;
  description: string;
  serious: boolean;
  reportedOn: string | null;
  invimaReference: string | null;
}

export interface VisitReport {
  from: string;
  to: string;
  generatedAt: string;
  establishment: { businessName: string; branchName: string | null; branchAddress: string | null;
    branchPhone: string | null; technicalDirector: TechnicalDirector };
  quality: { points: QualityPoint[]; readings: QualityReading[]; expected: number; missing: number; outOfRange: number };
  alertMonths: number;
  expired: LotRow[];
  expiring: LotRow[];
  disposals: { number: number; createdAt: string; reason: string | null; method: string | null; witness: string | null;
    value: number }[];
  receipts: { number: number; receivedAt: string; supplier: string; invoice: string; total: number; rejectedTotal: number;
    coldChainTemperature: number | null; checksConfirmed: boolean }[];
  dispensations: { total: number; antibiotics: number; controlled: number; voided: number };
  antibiotics: { at: string; saleNumber: string; patientName: string | null; patientDocument: string | null;
    prescriberName: string | null; prescriberLicense: string | null; medicines: string | null }[];
  adverseEvents: AdverseEvent[];
}

function branchParams(branchId: string | null, extra: Record<string, string | null> = {}): HttpParams {
  let params = new HttpParams();
  for (const [k, v] of Object.entries({ branchId, ...extra })) {
    if (v) {
      params = params.set(k, v);
    }
  }
  return params;
}

/** Farmacia (Fase 13-4, decisión 282): dispensación, libro y director técnico; calidad (13-6). */
@Injectable({ providedIn: 'root' })
export class PharmacyApi {
  private readonly http = inject(HttpClient);

  dispensing(productIds: string[]): Observable<DispensingInfo[]> {
    return this.http.get<DispensingInfo[]>('/api/v1/medicines/dispensing', { params: { productIds: productIds.join(',') } });
  }

  book(from: string | null, to: string | null, antibioticOnly: boolean, search: string | null,
       query: PageQuery): Observable<PageResponse<Dispensation>> {
    return this.http.get<PageResponse<Dispensation>>('/api/v1/pharmacy/dispensations', {
      params: pageParams(query, { from, to, antibioticOnly: antibioticOnly ? 'true' : null, search }),
    });
  }

  technicalDirector(): Observable<TechnicalDirector> {
    return this.http.get<TechnicalDirector>('/api/v1/pharmacy/technical-director');
  }

  saveTechnicalDirector(input: TechnicalDirector): Observable<TechnicalDirector> {
    return this.http.put<TechnicalDirector>('/api/v1/pharmacy/technical-director', input);
  }
  /** Lo de hoy; {@code quiet}: sin avisos de error (el aviso del inicio). */
  qualityToday(branchId: string | null, quiet = false): Observable<QualityToday> {
    return this.http.get<QualityToday>('/api/v1/pharmacy/quality/today', { params: branchParams(branchId),
      context: quiet ? new HttpContext().set(SILENT_ALL_ERRORS, true) : undefined });
  }

  qualityPoints(branchId: string | null): Observable<QualityPoint[]> {
    return this.http.get<QualityPoint[]>('/api/v1/pharmacy/quality/points', { params: branchParams(branchId) });
  }

  createQualityPoint(branchId: string | null, input: QualityPointInput): Observable<QualityPoint> {
    return this.http.post<QualityPoint>('/api/v1/pharmacy/quality/points', input, { params: branchParams(branchId) });
  }

  updateQualityPoint(id: string, input: QualityPointInput): Observable<QualityPoint> {
    return this.http.put<QualityPoint>(`/api/v1/pharmacy/quality/points/${id}`, input);
  }

  recordReading(input: { pointId: string; shift: QualityShift; temperature: number; humidity: number | null;
    actionTaken: string | null }): Observable<QualityReading> {
    return this.http.post<QualityReading>('/api/v1/pharmacy/quality/readings', input);
  }

  readings(branchId: string | null, from: string, to: string): Observable<QualityReading[]> {
    return this.http.get<QualityReading[]>('/api/v1/pharmacy/quality/readings', { params: branchParams(branchId, { from, to }) });
  }

  adverseEvents(branchId: string | null, from: string | null, to: string | null): Observable<AdverseEvent[]> {
    return this.http.get<AdverseEvent[]>('/api/v1/pharmacy/adverse-events', { params: branchParams(branchId, { from, to }) });
  }

  createAdverseEvent(input: AdverseEventInput): Observable<AdverseEvent> {
    return this.http.post<AdverseEvent>('/api/v1/pharmacy/adverse-events', input);
  }

  reportAdverseEvent(id: string, reportedOn: string, invimaReference: string | null): Observable<AdverseEvent> {
    return this.http.put<AdverseEvent>(`/api/v1/pharmacy/adverse-events/${id}/report`, { reportedOn, invimaReference });
  }

  visitReport(branchId: string | null, from: string, to: string): Observable<VisitReport> {
    return this.http.get<VisitReport>('/api/v1/pharmacy/visit-report', { params: branchParams(branchId, { from, to }) });
  }
}
