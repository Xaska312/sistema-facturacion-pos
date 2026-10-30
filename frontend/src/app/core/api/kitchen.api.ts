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

/** Nueva → Preparando → Lista → Entregada (Fase 12b-4). */
export type TicketStatus = 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED';

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
  sentById: string | null;
  sentByName: string | null;
  status: TicketStatus;
  printCount: number;
  /** ORDER: lo enviado; VOID: aviso de anulación de productos de la comanda {@code voidOfNumber}. */
  type: 'ORDER' | 'VOID';
  voidOfNumber: number | null;
  preparingAt: string | null;
  readyAt: string | null;
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

  /** Pantalla de cocina: lo que falta por entregar, la más vieja primero. */
  board(branchId: string | null, stationIds: readonly string[] = []): Observable<KitchenTicket[]> {
    let params = new HttpParams();
    if (branchId) {
      params = params.set('branchId', branchId);
    }
    for (const id of stationIds) {
      params = params.append('stationId', id);
    }
    return this.http.get<KitchenTicket[]>('/api/v1/kitchen/board', { params });
  }

  setStatus(id: string, status: TicketStatus): Observable<KitchenTicket> {
    return this.http.post<KitchenTicket>(`/api/v1/kitchen/tickets/${id}/status`, { status });
  }

  ticket(id: string): Observable<KitchenTicket> {
    return this.http.get<KitchenTicket>(`/api/v1/kitchen/tickets/${id}`);
  }

  /** Registra una impresión; {@code auto}: la reclama la impresora automática (409 si otro equipo ya la imprimió). */
  print(id: string, auto = false): Observable<KitchenTicket> {
    return this.http.post<KitchenTicket>(`/api/v1/kitchen/tickets/${id}/print`, { auto });
  }
}
