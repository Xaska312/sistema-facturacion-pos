import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { MedicineKind, SaleCondition } from './api.models';

/** Ficha del medicamento de un producto (Fase 13-1, decisión 279). */
export interface MedicineSheet {
  productId: string;
  kind: MedicineKind;
  sanitaryRegistration: string | null;
  cum: string | null;
  activeIngredients: string | null;
  dosageForm: string | null;
  route: string | null;
  atc: string | null;
  holder: string | null;
  saleCondition: SaleCondition | null;
  antibiotic: boolean;
  coldChain: boolean;
  unitSale: boolean;
  /** Lote y vencimiento en compras y ventas (Fase 13-2): siempre en medicamento, fitoterapéutico y dispositivo médico. */
  tracksLots: boolean;
}

export type MedicineSheetInput = Omit<MedicineSheet, 'productId'>;

/** Una presentación del catálogo CUM del INVIMA (compartido, lo carga la consola de plataforma). */
export interface CumEntry {
  cum: string;
  productName: string;
  holder: string | null;
  sanitaryRegistration: string | null;
  presentation: string | null;
  atc: string | null;
  atcDescription: string | null;
  route: string | null;
  dosageForm: string | null;
  activeIngredients: string;
  ium: string | null;
}

@Injectable({ providedIn: 'root' })
export class MedicinesApi {
  private readonly http = inject(HttpClient);

  /** null si el producto aún no tiene ficha (204). */
  sheet(productId: string): Observable<MedicineSheet | null> {
    return this.http.get<MedicineSheet>(`/api/v1/products/${productId}/medicine`, { observe: 'response' })
      .pipe(map((res) => (res.status === 204 ? null : res.body)));
  }

  saveSheet(productId: string, input: MedicineSheetInput): Observable<MedicineSheet> {
    return this.http.put<MedicineSheet>(`/api/v1/products/${productId}/medicine`, input);
  }

  searchCatalog(q: string): Observable<CumEntry[]> {
    return this.http.get<CumEntry[]>('/api/v1/medicines/catalog', { params: new HttpParams().set('q', q) });
  }
}
