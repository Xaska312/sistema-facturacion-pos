import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResponse } from './api.models';

/** Fila de la auditoría del negocio. */
export interface AuditEntry {
  id: string;
  createdAt: string;
  /** Nulo si la acción no tiene autor (tarea del sistema). */
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  /** Nombre, número, código o correo del registro afectado, si lo hay. */
  label: string | null;
  ip: string | null;
  /** Tiene datos de antes o después para ver en el detalle. */
  hasData: boolean;
}

export type AuditData = Record<string, unknown>;

export interface AuditDetail extends Omit<AuditEntry, 'hasData'> {
  before: AuditData | null;
  after: AuditData | null;
}

export interface AuditActionOption {
  entity: string;
  action: string;
  count: number;
}

export interface AuditActorOption {
  id: string;
  name: string | null;
}

export interface AuditFilters {
  /** AAAA-MM-DD; sin fechas, el servidor usa los últimos 7 días. */
  from: string | null;
  to: string | null;
  actorId: string | null;
  entity: string | null;
  action: string | null;
  /** Busca en el id del registro y en los datos guardados. */
  q: string | null;
}

/** Auditoría del negocio (permiso audit:read): quién hizo qué y cuándo. Solo lectura. */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/audit';

  search(filters: AuditFilters, page: number, size: number): Observable<PageResponse<AuditEntry>> {
    const params = auditParams(filters).set('page', page).set('size', size);
    return this.http.get<PageResponse<AuditEntry>>(this.base, { params });
  }

  detail(id: string): Observable<AuditDetail> {
    return this.http.get<AuditDetail>(`${this.base}/${id}`);
  }

  actions(): Observable<AuditActionOption[]> {
    return this.http.get<AuditActionOption[]>(`${this.base}/actions`);
  }

  actors(): Observable<AuditActorOption[]> {
    return this.http.get<AuditActorOption[]>(`${this.base}/actors`);
  }

  /** CSV para Excel en español con los mismos filtros (la exportación queda registrada en la auditoría). */
  csv(filters: AuditFilters): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/export.csv`, {
      params: auditParams(filters),
      observe: 'response',
      responseType: 'blob',
    });
  }
}

/** Parámetros de los filtros; los vacíos no se envían. */
export function auditParams(filters: AuditFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters) as [keyof AuditFilters, string | null][]) {
    const clean = value?.trim();
    if (clean) {
      params = params.set(key, clean);
    }
  }
  return params;
}
