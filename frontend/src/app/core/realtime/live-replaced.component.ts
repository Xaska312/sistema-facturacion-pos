import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DiningEventsService } from './dining-events.service';

/**
 * Aviso para Mesas, la cuenta, Comandas y Cocina (decisión 291): otra pantalla de esta misma cuenta tomó los avisos
 * en vivo (cada cuenta tiene un tope de pantallas a la vez). Esta sigue al día consultando cada pocos segundos; con
 * "Recibir avisos aquí" los vuelve a tomar y los deja la pantalla más vieja.
 */
@Component({
  selector: 'app-live-replaced',
  imports: [ButtonModule],
  template: `
    @if (events.replaced()) {
      <div class="rounded-lg border border-warning bg-warning-soft text-warning-soft-fg p-3 text-sm mb-4
                  flex flex-wrap items-center justify-between gap-3" role="status">
        <p class="flex items-start gap-2 min-w-0 flex-1 basis-64">
          <i class="pi pi-info-circle mt-0.5" aria-hidden="true"></i>
          <span>
            <span class="font-semibold">Los avisos en vivo pasaron a otra pantalla de esta cuenta.</span>
            Aquí todo se sigue actualizando cada pocos segundos.
          </span>
        </p>
        <p-button label="Recibir avisos aquí" icon="pi pi-bolt" size="small" severity="secondary" [outlined]="true"
                  (onClick)="events.takeOver()" />
      </div>
    }
  `,
})
export class LiveReplacedComponent {
  protected readonly events = inject(DiningEventsService);
}
