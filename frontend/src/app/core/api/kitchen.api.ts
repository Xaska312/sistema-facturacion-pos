import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { TabKind } from './dining.api';

/** Cocina y comandas (Fase 12b-3, decisión 270). */
export interface StationRef {
  id: string;
  name: string;
}

export interface KitchenStation {
  id: string;
  name: string;
  /** La principal recibe todo lo que no tiene otra estación. */
  main: boolean;
  position: number;
  active: boolean;
  categories: StationRef[];
  products: StationRef[];
}

export interface StationInput {
  name: string;
  main: boolean;
  active: boolean;
  categoryIds: string[];
  productIds: string[];
}

export interface TicketModifier {
  groupName: string;
  name: string;
  quantity: number;
  /** Elección obligatoria de una sola opción (término, tamaño): va destacada. */
  highlight: boolean;
}

export interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  modifiers: TicketModifier[];
  voided: boolean;
}

export interface KitchenTicket {
  id: string;
  number: number;
  branchId: string;
  tabId: string;
  /** La cuenta como estaba al enviar ("Mesa 4"). */
  tabLabel: string;
  kind: TabKind;
  guests: number | null;
  notes: string | null;
  stationId: string;
  stationName: string;
  sentAt: string;
  sentByName: string | null;
  status: string;
  printCount: number;
  items: TicketItem[];
}

@Injectable({ providedIn: 'root' })
export class KitchenApi {
  private readonly http = inject(HttpClient);

  stations(): Observable<KitchenStation[]> {
    return this.http.get<KitchenStation[]>('/api/v1/kitchen/stations');
  }

  createStation(input: StationInput): Observable<KitchenStation> {
    return this.http.post<KitchenStation>('/api/v1/kitchen/stations', input);
  }

  updateStation(id: string, input: StationInput): Observable<KitchenStation> {
    return this.http.put<KitchenStation>(`/api/v1/kitchen/stations/${id}`, input);
  }

  /** Comandas recientes; {@code pending}: las que nadie ha impreso (la impresora automática). */
  tickets(branchId: string | null, stationIds: readonly string[] = [], pending = false): Observable<KitchenTicket[]> {
    let params = new HttpParams();
    if (branchId) {
      params = params.set('branchId', branchId);
    }
    for (const id of stationIds) {
      params = params.append('stationId', id);
    }
    if (pending) {
      params = params.set('pending', 'true');
    }
    return this.http.get<KitchenTicket[]>('/api/v1/kitchen/tickets', { params });
  }

  ticket(id: string): Observable<KitchenTicket> {
    return this.http.get<KitchenTicket>(`/api/v1/kitchen/tickets/${id}`);
  }

  /** Registra una impresión; {@code auto}: la reclama la impresora automática (409 si otro equipo ya la imprimió). */
  print(id: string, auto = false): Observable<KitchenTicket> {
    return this.http.post<KitchenTicket>(`/api/v1/kitchen/tickets/${id}/print`, { auto });
  }
}
