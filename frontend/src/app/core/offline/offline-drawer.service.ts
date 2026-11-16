import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CashApi } from '../api/cash.api';
import { newIdempotencyKey } from '../api/sales.api';
import { AuthService } from '../auth/auth.service';
import { OnlineService } from '../network/online.service';
import { idbGet, idbSet } from './idb';
import { isNetworkError } from './offline-sales.service';

/** Una apertura del cajón hecha sin internet, por registrar en la auditoría (decisión 352). */
export interface PendingDrawerOpening {
  key: string;
  reason: string | null;
  openedAt: string;
}

const RETRY_MS = 30 * 1000;

/**
 * Aperturas del cajón hechas sin internet (decisión 352). Sin conexión el cajón se abre igual (XASKA Impresora está en
 * el mismo computador) y el registro para la auditoría se guarda en el equipo; se envía al volver la conexión, con su
 * clave (no se duplica si se reintenta) y la hora en que pasó.
 */
@Injectable({ providedIn: 'root' })
export class OfflineDrawerService {
  private readonly cash = inject(CashApi);
  private readonly auth = inject(AuthService);
  private readonly online = inject(OnlineService).online;
  private readonly queue = signal<PendingDrawerOpening[]>([]);
  private loadedFor: string | null = null;
  private running = false;

  /** Aperturas sin conexión que aún no llegan al servidor. */
  readonly pending = signal(0);

  constructor() {
    effect(() => {
      if (this.online()) {
        void this.sync();
      }
    });
    const timer = setInterval(() => {
      if (this.queue().length > 0) {
        void this.sync();
      }
    }, RETRY_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private storageKey(): string | null {
    const tenant = this.auth.currentTenant()?.id;
    const user = this.auth.user()?.id;
    return tenant && user ? `offline-drawer:${tenant}:${user}` : null;
  }

  private async prepare(): Promise<void> {
    const key = this.storageKey();
    if (key && this.loadedFor !== key) {
      this.loadedFor = key;
      this.set((await idbGet<PendingDrawerOpening[]>(key)) ?? []);
    }
  }

  private set(list: PendingDrawerOpening[]): void {
    this.queue.set(list);
    this.pending.set(list.length);
  }

  private async save(list: PendingDrawerOpening[]): Promise<void> {
    this.set(list);
    const key = this.storageKey();
    if (key) {
      await idbSet(key, list);
    }
  }

  /** Guarda la apertura en el equipo y trata de enviarla. */
  async record(reason: string | null, now: Date = new Date()): Promise<void> {
    await this.prepare();
    await this.save([...this.queue(), { key: newIdempotencyKey('cajon'), reason, openedAt: now.toISOString() }]);
    void this.sync();
  }

  /** Envía en orden lo pendiente; se detiene en el primer error de red. */
  async sync(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.prepare();
      for (const entry of [...this.queue()]) {
        try {
          await firstValueFrom(this.cash.drawerOpenedOffline(entry));
        } catch (error) {
          if (isNetworkError(error)) {
            return;
          }
          // El servidor lo rechazó (p. ej. ya no tiene el permiso): no tiene arreglo reintentando.
        }
        await this.save(this.queue().filter((p) => p.key !== entry.key));
      }
    } finally {
      this.running = false;
    }
  }
}
