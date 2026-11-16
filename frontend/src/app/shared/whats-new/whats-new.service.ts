import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { RELEASES, Release, unseenReleases } from './releases';

/**
 * Qué hay de nuevo (decisión 354): cuál fue la última versión que vio cada persona en este navegador y la ventana con
 * todas las novedades (desde el menú del usuario).
 */
@Injectable({ providedIn: 'root' })
export class WhatsNewService {
  private readonly auth = inject(AuthService);
  private readonly version = signal(0);
  readonly releases: readonly Release[] = RELEASES;
  readonly open = signal(false);

  private key(): string | null {
    const id = this.auth.user()?.id;
    return id ? `xaska.novedades:${id}` : null;
  }

  private seenId(): string | null {
    const key = this.key();
    try {
      return key ? globalThis.localStorage?.getItem(key) ?? null : null;
    } catch {
      return null;
    }
  }

  /** Lo que la persona no ha visto; vacío si ya vio la última. */
  readonly unseen = computed(() => {
    this.version();
    this.auth.user();
    return unseenReleases(this.releases, this.seenId());
  });

  markSeen(): void {
    const key = this.key();
    const latest = this.releases[0]?.id;
    if (key && latest) {
      try {
        globalThis.localStorage?.setItem(key, latest);
      } catch {
        // Sin almacenamiento: vuelve a salir en la próxima visita.
      }
    }
    this.version.update((v) => v + 1);
  }

  show(): void {
    this.open.set(true);
    this.markSeen();
  }
}
