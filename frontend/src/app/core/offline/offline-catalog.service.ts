import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OfflineCatalog, OfflineCatalogItem, ProductLookup } from '../api/api.models';
import { SalesApi } from '../api/sales.api';
import { AuthService } from '../auth/auth.service';
import { idbGet, idbSet } from './idb';
import { findByCode, findByProduct, lookupFromItem, searchItems } from './offline-catalog';

/** Cada cuánto se renueva la copia mientras hay internet. */
const REFRESH_MS = 10 * 60 * 1000;

/**
 * Copia del catálogo en el equipo para vender sin internet (decisión 332): se baja al abrir Vender y cada 10 minutos
 * mientras hay conexión, y queda guardada (IndexedDB) por negocio.
 */
@Injectable({ providedIn: 'root' })
export class OfflineCatalogService {
  private readonly sales = inject(SalesApi);
  private readonly auth = inject(AuthService);

  private readonly catalog = signal<OfflineCatalog | null>(null);
  private loadedFor: string | null = null;
  private refreshedAt = 0;

  /** Cuándo se bajó la copia que hay en el equipo (null si no hay). */
  readonly generatedAt = computed(() => this.catalog()?.generatedAt ?? null);
  readonly ready = computed(() => (this.catalog()?.items.length ?? 0) > 0);

  private key(): string | null {
    const tenant = this.auth.currentTenant()?.id;
    return tenant ? `catalog:${tenant}` : null;
  }

  /** Carga la copia guardada del negocio actual (una vez) y la renueva si toca y hay internet. */
  async prepare(online: boolean): Promise<void> {
    const key = this.key();
    if (!key) {
      return;
    }
    if (this.loadedFor !== key) {
      this.loadedFor = key;
      this.catalog.set((await idbGet<OfflineCatalog>(key)) ?? null);
      this.refreshedAt = 0;
    }
    if (online && Date.now() - this.refreshedAt > REFRESH_MS) {
      await this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const key = this.key();
    if (!key) {
      return;
    }
    try {
      const fresh = await firstValueFrom(this.sales.offlineCatalog());
      this.refreshedAt = Date.now();
      this.catalog.set(fresh);
      await idbSet(key, fresh);
    } catch {
      // Sin conexión: se queda la copia que había.
    }
  }

  private items(): readonly OfflineCatalogItem[] {
    return this.catalog()?.items ?? [];
  }

  lookup(code: string): ProductLookup | null {
    const item = findByCode(this.items(), code);
    return item ? lookupFromItem(item) : null;
  }

  price(productId: string, unitId: string | null): ProductLookup | null {
    const item = findByProduct(this.items(), productId, unitId);
    return item ? lookupFromItem(item) : null;
  }

  search(text: string): OfflineCatalogItem[] {
    return searchItems(this.items(), text);
  }
}
