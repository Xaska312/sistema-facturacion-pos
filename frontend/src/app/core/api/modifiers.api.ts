import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Adiciones y modificadores (Fase 12b-1, decisión 268). */
export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  maxQuantity: number;
  active: boolean;
}

export interface ModifierRef {
  id: string;
  name: string;
}

export interface ModifierGroup {
  id: string;
  name: string;
  /** Mayor que 0 = obligatorio. */
  minSelect: number;
  /** Unidades que se pueden elegir en el grupo ("Shot extra ×2" cuenta 2). */
  maxSelect: number;
  active: boolean;
  options: ModifierOption[];
  products: ModifierRef[];
  categories: ModifierRef[];
}

export interface ModifierOptionInput {
  id: string | null;
  name: string;
  priceDelta: number;
  maxQuantity: number;
  active: boolean;
}

export interface ModifierGroupInput {
  name: string;
  minSelect: number;
  maxSelect: number;
  active: boolean;
  options: ModifierOptionInput[];
  productIds: string[];
  categoryIds: string[];
}

/** Grupo activo con sus opciones activas, como lo usa el POS. */
export interface PosModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; priceDelta: number; maxQuantity: number }[];
}

/** Grupos activos y, por producto, los que le aplican (los suyos y los de su categoría) en orden. */
export interface PosModifierCatalog {
  groups: PosModifierGroup[];
  products: Record<string, string[]>;
}

export interface ModifierReportRow {
  groupName: string;
  optionName: string;
  units: number;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class ModifiersApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/modifier-groups';

  list(): Observable<ModifierGroup[]> {
    return this.http.get<ModifierGroup[]>(this.base);
  }

  pos(): Observable<PosModifierCatalog> {
    return this.http.get<PosModifierCatalog>(`${this.base}/pos`);
  }

  create(input: ModifierGroupInput): Observable<ModifierGroup> {
    return this.http.post<ModifierGroup>(this.base, input);
  }

  update(id: string, input: ModifierGroupInput): Observable<ModifierGroup> {
    return this.http.put<ModifierGroup>(`${this.base}/${id}`, input);
  }

  /** Adiciones más vendidas (necesita reports:read). Fechas ISO (yyyy-mm-dd). */
  report(from: string, to: string): Observable<ModifierReportRow[]> {
    return this.http.get<ModifierReportRow[]>('/api/v1/reports/modifiers', { params: new HttpParams().set('from', from).set('to', to) });
  }
}
