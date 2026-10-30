import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Observable, Subscription, catchError, concatMap, filter, from, map, of, toArray } from 'rxjs';
import { KitchenApi, KitchenTicket } from '../../core/api/kitchen.api';
import { AuthService } from '../../core/auth/auth.service';
import { DiningEventsService } from '../../core/realtime/dining-events.service';
import { loadReceiptWidth } from '../../shared/receipt/receipt-prefs';
import { printComandas } from './comanda-print';

/**
 * Impresora de comandas de este equipo (Fase 12b-3, decisión 270). Es una preferencia del equipo, no del negocio: el
 * computador de la cocina (o de la caja) marca qué estaciones imprime y, mientras XASKA esté abierto en cualquier
 * pantalla, saca solo las comandas nuevas de esas estaciones. Cada comanda la reclama un solo equipo en el servidor,
 * así dos impresoras de la misma estación no la sacan dos veces. Para que Chrome imprima sin preguntar se abre con
 * --kiosk-printing (manual de uso). Desde la Fase 12b-4 imprime al llegar el aviso en tiempo real.
 */
export interface PrinterConfig {
  branchId: string | null;
  stationIds: string[];
}

const KEY = 'pos.kitchenPrinter.';
export const PRINTER_POLL_MS = 5000;

export function loadPrinterConfig(tenantId: string | null): PrinterConfig | null {
  if (!tenantId) {
    return null;
  }
  try {
    const raw = globalThis.localStorage?.getItem(KEY + tenantId);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PrinterConfig>;
    const stationIds = Array.isArray(parsed.stationIds) ? parsed.stationIds.filter((s) => typeof s === 'string') : [];
    return stationIds.length > 0 ? { branchId: typeof parsed.branchId === 'string' ? parsed.branchId : null, stationIds } : null;
  } catch {
    return null;
  }
}

export function savePrinterConfig(tenantId: string | null, config: PrinterConfig | null): void {
  if (!tenantId) {
    return;
  }
  try {
    if (config && config.stationIds.length > 0) {
      globalThis.localStorage?.setItem(KEY + tenantId, JSON.stringify(config));
    } else {
      globalThis.localStorage?.removeItem(KEY + tenantId);
    }
  } catch {
    // Sin almacenamiento (modo privado): este equipo no queda como impresora.
  }
}

@Injectable({ providedIn: 'root' })
export class KitchenPrinterService {
  private readonly api = inject(KitchenApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  /** Configuración de este equipo para el negocio abierto (null: no imprime). */
  readonly config = signal<PrinterConfig | null>(null);
  /** Última comanda que sacó (para mostrarlo en Comandas). */
  readonly lastPrinted = signal<number | null>(null);

  private readonly events = inject(DiningEventsService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private subscription: Subscription | null = null;
  private beats = 0;
  private busy = false;

  /**
   * Lo llama el marco de la aplicación al entrar; no hace nada si el equipo no imprime. Con los avisos en tiempo real
   * (Fase 12b-4) imprime al llegar la comanda; la consulta cada 5 s queda de respaldo (y una vez por minuto, por si
   * se perdió un aviso).
   */
  start(): void {
    this.config.set(loadPrinterConfig(this.auth.tenantId()));
    if (this.timer === null) {
      this.timer = setInterval(() => {
        this.beats++;
        if (!this.events.connected() || this.beats % 12 === 0) {
          this.tick();
        }
      }, PRINTER_POLL_MS);
    }
    this.subscription ??= this.events.events$
      .pipe(filter((e) => e.type === 'TICKET_SENT' || e.type === 'ITEM_VOIDED'))
      .subscribe(() => this.tick());
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  configure(config: PrinterConfig | null): void {
    savePrinterConfig(this.auth.tenantId(), config);
    this.config.set(loadPrinterConfig(this.auth.tenantId()));
  }

  private tick(): void {
    const config = loadPrinterConfig(this.auth.tenantId());
    this.config.set(config);
    const allowed = this.auth.hasPermission('kitchen:send') || this.auth.hasPermission('kitchen:view');
    if (this.busy || !config || !allowed || !this.auth.hasPermission('module:kitchen')) {
      return;
    }
    this.busy = true;
    this.api.tickets(config.branchId, config.stationIds, true).pipe(
      concatMap((list) => this.claim(list)),
    ).subscribe({
      next: (claimed) => {
        if (claimed.length === 0) {
          this.busy = false;
          return;
        }
        this.lastPrinted.set(claimed[claimed.length - 1].number);
        void printComandas(claimed, loadReceiptWidth()).then(() => (this.busy = false));
      },
      error: () => (this.busy = false),
    });
  }

  /** Reclama una por una; las que otro equipo ya imprimió (409) se saltan. */
  private claim(list: readonly KitchenTicket[]): Observable<KitchenTicket[]> {
    if (list.length === 0) {
      return of([]);
    }
    return from(list).pipe(
      concatMap((t) => this.api.print(t.id, true).pipe(catchError(() => of(null)))),
      toArray(),
      map((all) => all.filter((t): t is KitchenTicket => t !== null)),
    );
  }

  /** Reimprime a mano (queda en la auditoría si ya se había impreso). */
  printNow(ticketId: string): void {
    this.api.print(ticketId).subscribe({
      next: (t) => void printComandas([t], loadReceiptWidth()),
      error: () => this.messages.add({ severity: 'error', summary: 'No se pudo imprimir la comanda' }),
    });
  }
}
