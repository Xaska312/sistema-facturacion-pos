import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';
import { PageQuery, pageParams } from './organization.api';

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

/** Farmacia (Fase 13-4, decisión 282): dispensación, libro y director técnico. */
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
}
