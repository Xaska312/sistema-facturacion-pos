import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse, Party, PartyInput } from './api.models';
import { PageQuery, pageParams } from './organization.api';

export type PartyKind = 'customers' | 'suppliers';

/** Clientes y proveedores (mismo contrato; los clientes agregan lista de precios y cupo). */
@Injectable({ providedIn: 'root' })
export class PartiesApi {
  private readonly http = inject(HttpClient);

  search(kind: PartyKind, query: PageQuery, search: string | null, includeInactive: boolean): Observable<PageResponse<Party>> {
    return this.http.get<PageResponse<Party>>(`/api/v1/${kind}`, {
      params: pageParams(query, { search, includeInactive: includeInactive ? 'true' : null }),
    });
  }

  save(kind: PartyKind, id: string | null, input: PartyInput): Observable<Party> {
    return id ? this.http.put<Party>(`/api/v1/${kind}/${id}`, input) : this.http.post<Party>(`/api/v1/${kind}`, input);
  }

  setActive(kind: PartyKind, id: string, active: boolean): Observable<Party> {
    return this.http.post<Party>(`/api/v1/${kind}/${id}/${active ? 'activate' : 'deactivate'}`, null);
  }
}
