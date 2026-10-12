import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Branding, BrandingApi } from '../api/branding.api';
import { AuthService } from '../auth/auth.service';
import { applyBrandColor } from './brand-palettes';

/**
 * Marca del negocio en uso (fase 8c): al entrar a un negocio se pide su color y su logo; al salir o cambiar de
 * negocio se vuelve a los colores de siempre. El logo se usa en el encabezado y en el tiquete.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly api = inject(BrandingApi);
  private readonly auth = inject(AuthService);

  readonly branding = signal<Branding | null>(null);
  readonly logo = computed(() => this.branding()?.logo ?? null);

  constructor() {
    effect(() => {
      const tenant = this.auth.tenantId();
      untracked(() => {
        // La última marca conocida de ese negocio se aplica de una vez (sin parpadeo de color al recargar y con logo
        // aunque falle la red); luego se actualiza con la del servidor.
        this.use(tenant ? readCached(tenant) : null);
        if (tenant) {
          this.api.get().subscribe({
            // Si mientras tanto se cambió de negocio, la respuesta es de otro: se descarta.
            next: (branding) => {
              if (this.auth.tenantId() === tenant) {
                this.use(branding);
              }
            },
            error: () => undefined,
          });
        }
      });
    });
  }

  /** Después de guardar en Ajustes: se aplica sin recargar. */
  use(branding: Branding | null): void {
    this.branding.set(branding);
    applyBrandColor(branding?.color);
    const tenant = this.auth.tenantId();
    if (branding && tenant) {
      writeCached(tenant, branding);
    }
  }
}

const CACHE_PREFIX = 'pos.branding.';

/** Marca guardada en este navegador para ese negocio (no es secreta: color y logo). */
function readCached(tenantId: string): Branding | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tenantId);
    const value = raw ? (JSON.parse(raw) as Partial<Branding>) : null;
    return value && typeof value.color === 'string'
      ? { color: value.color, logo: typeof value.logo === 'string' ? value.logo : null, updatedAt: null }
      : null;
  } catch {
    return null;
  }
}

function writeCached(tenantId: string, branding: Branding): void {
  try {
    localStorage.setItem(CACHE_PREFIX + tenantId, JSON.stringify({ color: branding.color, logo: branding.logo }));
  } catch {
    // Sin espacio o almacenamiento bloqueado: solo se pierde el arranque rápido.
  }
}
