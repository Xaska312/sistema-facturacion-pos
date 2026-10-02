import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Branch,
  BranchInput,
  BusinessSettings,
  CashRegister,
  City,
  Department,
  PageResponse,
} from './api.models';

export interface PageQuery {
  page: number;
  size: number;
  sort?: string;
}

export function pageParams(query: PageQuery, extra: Record<string, string | null | undefined> = {}): HttpParams {
  let params = new HttpParams().set('page', query.page).set('size', query.size);
  if (query.sort) {
    params = params.set('sort', query.sort);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params = params.set(key, value);
    }
  }
  return params;
}

/** Sucursales, cajas, ajustes del negocio y catálogo DIVIPOLA. */
@Injectable({ providedIn: 'root' })
export class OrganizationApi {
  private readonly http = inject(HttpClient);

  branches(query: PageQuery): Observable<PageResponse<Branch>> {
    return this.http.get<PageResponse<Branch>>('/api/v1/branches', { params: pageParams(query) });
  }

  createBranch(code: string, input: BranchInput): Observable<Branch> {
    return this.http.post<Branch>('/api/v1/branches', { code, ...input });
  }

  updateBranch(id: string, input: BranchInput): Observable<Branch> {
    return this.http.put<Branch>(`/api/v1/branches/${id}`, input);
  }

  setBranchActive(id: string, active: boolean): Observable<Branch> {
    return this.http.post<Branch>(`/api/v1/branches/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }

  cashRegisters(query: PageQuery, branchId: string | null): Observable<PageResponse<CashRegister>> {
    return this.http.get<PageResponse<CashRegister>>('/api/v1/cash-registers', {
      params: pageParams(query, { branchId }),
    });
  }

  createCashRegister(branchId: string, code: string, name: string): Observable<CashRegister> {
    return this.http.post<CashRegister>('/api/v1/cash-registers', { branchId, code, name });
  }

  renameCashRegister(id: string, name: string): Observable<CashRegister> {
    return this.http.put<CashRegister>(`/api/v1/cash-registers/${id}`, { name });
  }

  setCashRegisterActive(id: string, active: boolean): Observable<CashRegister> {
    return this.http.post<CashRegister>(`/api/v1/cash-registers/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }

  settings(): Observable<BusinessSettings> {
    return this.http.get<BusinessSettings>('/api/v1/settings');
  }

  updateSettings(settings: BusinessSettings): Observable<BusinessSettings> {
    return this.http.put<BusinessSettings>('/api/v1/settings', settings);
  }

  departments(): Observable<Department[]> {
    return this.http.get<Department[]>('/api/v1/locations/departments');
  }

  cities(departmentCode: string): Observable<City[]> {
    return this.http.get<City[]>(`/api/v1/locations/departments/${departmentCode}/cities`);
  }
}
