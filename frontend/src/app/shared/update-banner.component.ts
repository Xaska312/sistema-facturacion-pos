import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { ButtonModule } from 'primeng/button';

/**
 * Versión nueva de XASKA (decisión 333): la app guardada en el equipo baja la nueva en segundo plano y aquí se avisa
 * con "Actualizar". Nunca recarga sola (podría haber una venta a medias); si nadie la aplica, entra al volver a abrir.
 */
@Component({
  selector: 'app-update-banner',
  imports: [ButtonModule],
  template: `
    @if (ready()) {
      <div class="update-banner card" role="status">
        <i class="pi pi-sparkles text-brand" aria-hidden="true"></i>
        <span class="text-sm"><strong>Hay una versión nueva de XASKA.</strong> Actualiza cuando termines lo que estás
          haciendo.</span>
        <p-button label="Actualizar" size="small" (onClick)="reload()" />
        <button type="button" class="text-sm text-muted hover:underline" (click)="ready.set(false)">Después</button>
      </div>
    }
  `,
  styles: `
    .update-banner { position: fixed; left: 50%; transform: translateX(-50%); bottom: 6rem; z-index: 60;
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
      max-width: calc(100vw - 1.5rem); box-shadow: var(--elevation-overlay); }
  `,
})
export class UpdateBannerComponent {
  protected readonly ready = signal(false);

  constructor() {
    const updates = inject(SwUpdate);
    if (updates.isEnabled) {
      updates.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), takeUntilDestroyed())
        .subscribe(() => this.ready.set(true));
    }
  }

  protected reload(): void {
    globalThis.location?.reload();
  }
}
