import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Sale, SalePaymentInput } from './api.models';
import type { TicketStatus } from './kitchen.api';

/** Mesas y cuentas abiertas (Fase 12b-2, decisión 269). */
export type TabKind = 'TABLE' | 'TAKEAWAY' | 'DELIVERY';
export type TabStatus = 'OPEN' | 'CHARGED' | 'CANCELLED' | 'MERGED';

export interface BranchOption {
  id: string;
  name: string;
}

export interface TabSummary {
  id: string;
  number: number;
  kind: TabKind;
  label: string;
  tableId: string | null;
  openedAt: string;
  guests: number | null;
  customerName: string | null;
  /** Con los precios del momento de agregar. */
  total: number;
  items: number;
  openedByName: string | null;
  /** Comandas listas para llevar a la mesa (Fase 12b-4). */
  ready: number;
  /** En qué va la mesa (decisión 284), para su color en el mapa. */
  state: TabState;
  billRequestedAt: string | null;
}

export type TabState = 'ORDERING' | 'KITCHEN' | 'READY' | 'EATING' | 'BILL';
export type TableShape = 'SQUARE' | 'ROUND' | 'RECT';

/** Lugar de una mesa en el plano de su zona (unidades de un plano de 100 × 70). x/y nulos = sin ubicar. */
export interface MapSpot {
  x: number | null;
  y: number | null;
  w: number;
  h: number;
  shape: TableShape;
}

export interface FloorTable {
  id: string;
  name: string;
  seats: number | null;
  tab: TabSummary | null;
  map: MapSpot;
}

/** Una caja de la sucursal; open: tiene un turno abierto ahora. */
export interface RegisterOption {
  id: string;
  name: string;
  open: boolean;
}

export interface FloorZone {
  id: string;
  name: string;
  tables: FloorTable[];
  /** Caja propia de la zona (decisión 285): sus mesas se cobran en esa caja. Nula = la de quien cobra. */
  cashRegister: RegisterOption | null;
}

export interface Floor {
  branchId: string;
  branches: BranchOption[];
  zones: FloorZone[];
  /** Para llevar y domicilios abiertos. */
  others: TabSummary[];
}

export interface DiningTable {
  id: string;
  zoneId: string;
  name: string;
  seats: number | null;
  position: number;
  active: boolean;
  map: MapSpot;
}

export interface DiningZone {
  id: string;
  branchId: string;
  name: string;
  position: number;
  active: boolean;
  tables: DiningTable[];
  /** Caja propia de la zona (decisión 285). Nula = la de quien cobra (lo normal). */
  cashRegister: RegisterOption | null;
}

export interface TabItemModifier {
  optionId: string;
  groupName: string;
  name: string;
  quantity: number;
  price: number;
}

export interface TabItem {
  id: string;
  position: number;
  productId: string;
  unitId: string | null;
  name: string;
  quantity: number;
  /** Producto + adiciones al agregar (para mostrar). */
  unitPrice: number;
  /** Producto sin adiciones (en precio libre, el escrito). */
  basePrice: number;
  openPrice: boolean;
  note: string | null;
  modifiers: TabItemModifier[];
  addedAt: string;
  addedByName: string | null;
  sentAt: string | null;
  /** Comanda en que salió a cocina (Fase 12b-3). */
  ticketNumber: number | null;
  stationName: string | null;
  voided: boolean;
  voidedAt: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  /** Venta en que se cobró esta línea (cobro por partes, Fase 12b-5). */
  saleId: string | null;
}

export interface Tab {
  id: string;
  number: number;
  kind: TabKind;
  status: TabStatus;
  label: string;
  branchId: string;
  tableId: string | null;
  tableName: string | null;
  zoneName: string | null;
  guests: number | null;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  openedAt: string;
  openedByName: string | null;
  closedAt: string | null;
  saleId: string | null;
  total: number;
  items: TabItem[];
  /** Comandas de la cuenta (Fase 12b-3). */
  tickets: TicketSummary[];
  /** Lo ya cobrado por partes (con los precios de cuando se pidió) y sus ventas (Fase 12b-5). */
  chargedTotal: number;
  saleIds: string[];
  /** La mesa pidió la cuenta (decisión 284). */
  billRequestedAt: string | null;
  /** Caja de la zona de la mesa (decisión 285): la venta queda ahí aunque se cobre desde otra. */
  chargeRegister: RegisterOption | null;
}

/** Comanda vista desde la cuenta. */
export interface TicketSummary {
  id: string;
  number: number;
  stationName: string;
  sentAt: string;
  printCount: number;
  items: number;
  status: TicketStatus;
}

export interface OpenTabInput {
  branchId?: string | null;
  kind: TabKind;
  tableId?: string | null;
  guests?: number | null;
  customerName?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface TabDetailsInput {
  guests: number | null;
  customerName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export interface TabItemInput {
  productId: string;
  unitId: string | null;
  quantity: number;
  /** Solo en precio libre. */
  unitPrice?: number | null;
  modifiers?: { optionId: string; quantity: number }[];
  note?: string | null;
}

/** Una parte de lo pedido para cobrar por separado (Fase 12b-5). */
export interface ChargePart {
  itemId: string;
  quantity: number;
}

export interface TipInput {
  amount: number;
  paymentMethodId: string;
  suggestedPercent: number | null;
}

export interface ChargeTabInput {
  customerId: string | null;
  payments: SalePaymentInput[];
  expectedTotal: number | null;
  /** Sin partes se cobra todo lo pendiente. */
  items?: ChargePart[];
  tip?: TipInput | null;
}

@Injectable({ providedIn: 'root' })
export class DiningApi {
  private readonly http = inject(HttpClient);

  floor(branchId: string | null): Observable<Floor> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : undefined;
    return this.http.get<Floor>('/api/v1/dining/floor', { params });
  }

  zones(branchId: string | null): Observable<DiningZone[]> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : undefined;
    return this.http.get<DiningZone[]>('/api/v1/dining/zones', { params });
  }

  createZone(branchId: string, name: string): Observable<DiningZone> {
    return this.http.post<DiningZone>('/api/v1/dining/zones', { branchId, name });
  }

  /** Cajas activas de la sucursal (para elegir la de una zona). */
  registers(branchId: string | null): Observable<RegisterOption[]> {
    const params = branchId ? new HttpParams().set('branchId', branchId) : undefined;
    return this.http.get<RegisterOption[]>('/api/v1/dining/registers', { params });
  }

  /** Caja de una zona (decisión 285); null = la de quien cobra. */
  setZoneCashRegister(zoneId: string, cashRegisterId: string | null): Observable<DiningZone> {
    return this.http.put<DiningZone>(`/api/v1/dining/zones/${zoneId}/cash-register`, { cashRegisterId });
  }

  updateZone(id: string, name: string, position: number, active: boolean): Observable<DiningZone> {
    return this.http.put<DiningZone>(`/api/v1/dining/zones/${id}`, { name, position, active });
  }

  createTable(zoneId: string, name: string, seats: number | null): Observable<DiningTable> {
    return this.http.post<DiningTable>('/api/v1/dining/tables', { zoneId, name, seats });
  }

  updateTable(id: string, input: { zoneId: string; name: string; seats: number | null; position: number; active: boolean }):
    Observable<DiningTable> {
    return this.http.put<DiningTable>(`/api/v1/dining/tables/${id}`, input);
  }

  /** Plano de una zona (decisión 284). */
  saveLayout(zoneId: string, tables: ({ tableId: string } & MapSpot)[]): Observable<DiningZone> {
    return this.http.put<DiningZone>(`/api/v1/dining/zones/${zoneId}/layout`, { tables });
  }

  /** La mesa pidió la cuenta (o se desmarca). */
  requestBill(id: string, requested: boolean): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/bill-request`, { requested });
  }

  open(input: OpenTabInput): Observable<Tab> {
    return this.http.post<Tab>('/api/v1/tabs', input);
  }

  tab(id: string): Observable<Tab> {
    return this.http.get<Tab>(`/api/v1/tabs/${id}`);
  }

  updateTab(id: string, input: TabDetailsInput): Observable<Tab> {
    return this.http.put<Tab>(`/api/v1/tabs/${id}`, input);
  }

  /** Con {@code send}, lo agregado sale a cocina en la misma operación (Fase 12b-3). */
  addItems(id: string, items: TabItemInput[], send = false): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/items`, { items, send });
  }

  /** Envía a cocina lo que la cuenta tiene sin enviar. */
  send(id: string): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/send`, null);
  }

  voidItem(id: string, itemId: string, reason: string): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/items/${itemId}/void`, { reason });
  }

  move(id: string, tableId: string): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/move`, { tableId });
  }

  merge(id: string, fromTabId: string): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/merge`, { fromTabId });
  }

  cancel(id: string, reason: string): Observable<Tab> {
    return this.http.post<Tab>(`/api/v1/tabs/${id}/cancel`, { reason });
  }

  /** Cobra la cuenta completa; responde la venta, como {@code POST /sales}. */
  charge(id: string, input: ChargeTabInput, idempotencyKey: string): Observable<Sale> {
    return this.http.post<Sale>(`/api/v1/tabs/${id}/charge`, input,
      { headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }) });
  }
}
