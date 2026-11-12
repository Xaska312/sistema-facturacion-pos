import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Sale, SaleInput } from '../api/api.models';
import { SalesApi } from '../api/sales.api';
import { AuthService } from '../auth/auth.service';
import { problemMessage } from '../errors/problem';
import { OnlineService } from '../network/online.service';
import { idbGet, idbSet } from './idb';

/** Una venta hecha sin internet, guardada en el equipo hasta que llegue al servidor (decisión 332). */
export interface PendingSale {
  key: string;
  input: SaleInput;
  /** El tiquete que se imprimió con el número provisional. */
  sale: Sale;
  status: 'pending' | 'failed';
  error?: string;
}

/** Cada cuánto se reintenta mientras hay ventas por enviar. */
const RETRY_MS = 30 * 1000;

/** ¿El error es de red (no llegó al servidor o el servidor no está)? Entonces se reintenta más tarde. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 502);
}

/** Número provisional del tiquete: "CAJA-1-SC0007". */
export function provisionalNumber(registerCode: string, sequence: number): string {
  return `${registerCode}-SC${String(sequence).padStart(4, '0')}`;
}

/**
 * Cola de ventas hechas sin internet (decisión 332), por negocio y usuario: se guardan en el equipo y se envían en
 * orden al volver la conexión con la misma clave con la que se cobraron, así que reenviar no duplica. Una venta que el
 * servidor rechaza (por ejemplo, la caja ya está cerrada) queda "con problema" para revisarla; nunca se borra sola.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSalesService {
  private readonly api = inject(SalesApi);
  private readonly auth = inject(AuthService);
  private readonly online = inject(OnlineService).online;

  private readonly queue = signal<PendingSale[]>([]);
  private loadedFor: string | null = null;
  private running = false;

  /** El servidor respondió la última vez (con wifi encendido pero sin internet, el navegador cree que hay red). */
  readonly reachable = signal(true);
  /** Sin conexión de verdad: el navegador sin red o el servidor sin responder. */
  readonly offline = computed(() => !this.online() || !this.reachable());
  readonly pending = computed(() => this.queue().filter((p) => p.status === 'pending').length);
  readonly failed = computed(() => this.queue().filter((p) => p.status === 'failed'));
  readonly syncing = signal(false);

  constructor() {
    effect(() => {
      if (this.online()) {
        void this.sync();
      }
    });
    const timer = setInterval(() => {
      if (this.queue().length > 0 || !this.reachable()) {
        void this.sync();
      }
    }, RETRY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private key(): string | null {
    const tenant = this.auth.currentTenant()?.id;
    const user = this.auth.user()?.id;
    return tenant && user ? `offline-sales:${tenant}:${user}` : null;
  }

  /** Carga la cola guardada del negocio y usuario actuales. */
  async prepare(): Promise<void> {
    const key = this.key();
    if (key && this.loadedFor !== key) {
      this.loadedFor = key;
      this.queue.set((await idbGet<PendingSale[]>(key)) ?? []);
    }
  }

  private async save(list: PendingSale[]): Promise<void> {
    this.queue.set(list);
    const key = this.key();
    if (key) {
      await idbSet(key, list);
    }
  }

  /** Siguiente número provisional de la caja en este equipo. */
  async nextNumber(registerId: string, registerCode: string): Promise<string> {
    const tenant = this.auth.currentTenant()?.id ?? '';
    const key = `offline-seq:${tenant}:${registerId}`;
    const next = ((await idbGet<number>(key)) ?? 0) + 1;
    await idbSet(key, next);
    return provisionalNumber(registerCode, next);
  }

  /** Guarda la venta en el equipo y trata de enviarla de una vez. */
  async enqueue(entry: Omit<PendingSale, 'status'>): Promise<void> {
    await this.prepare();
    await this.save([...this.queue(), { ...entry, status: 'pending' }]);
    void this.sync();
  }

  /** Anota que una petición falló por red: Vender pasa a modo sin conexión. */
  noteNetworkError(): void {
    this.reachable.set(false);
  }

  /** Vuelve a intentar una venta con problema (después de corregir lo que dijo el servidor, p. ej. abrir la caja). */
  async retry(key: string): Promise<void> {
    await this.save(this.queue().map((p) => (p.key === key ? { ...p, status: 'pending' as const, error: undefined } : p)));
    await this.sync();
  }

  /** Envía en orden lo pendiente. Se detiene en el primer error de red. */
  async sync(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.prepare();
      for (const entry of this.queue().filter((p) => p.status === 'pending')) {
        this.syncing.set(true);
        try {
          await firstValueFrom(this.api.sendOffline(entry.input, entry.key));
          this.reachable.set(true);
          await this.save(this.queue().filter((p) => p.key !== entry.key));
        } catch (error) {
          if (isNetworkError(error)) {
            this.reachable.set(false);
            return;
          }
          this.reachable.set(true);
          await this.save(this.queue().map((p) => (p.key === entry.key
            ? { ...p, status: 'failed' as const, error: problemMessage(error) }
            : p)));
        }
      }
      if (this.pending() === 0 && !this.reachable()) {
        // Nada por enviar: se prueba si el servidor ya responde con la copia del catálogo en la próxima apertura.
        this.reachable.set(this.online());
      }
    } finally {
      this.syncing.set(false);
      this.running = false;
    }
  }
}
