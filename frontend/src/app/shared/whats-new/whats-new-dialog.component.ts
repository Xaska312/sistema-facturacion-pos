import { Component, inject } from '@angular/core';
import { DialogComponent } from '../ui/dialog.component';
import { WhatsNewService } from './whats-new.service';

/** Todas las novedades (decisión 354): se abre desde el menú del usuario o desde la tarjeta de Inicio. */
@Component({
  selector: 'app-whats-new-dialog',
  imports: [DialogComponent],
  template: `
    <app-dialog header="Novedades de XASKA" [visible]="whatsNew.open()" (visibleChange)="whatsNew.open.set($event)"
                [modal]="true" [style]="{ width: '34rem' }" [breakpoints]="{ '640px': '100vw' }" [dismissableMask]="true">
      <div class="flex flex-col gap-5">
        @for (r of whatsNew.releases; track r.id) {
          <section>
            <h3 class="font-bold">{{ r.title }}</h3>
            <p class="text-xs text-muted">{{ date(r.id) }}</p>
            <ul class="text-sm flex flex-col gap-1 list-disc pl-5 mt-2">
              @for (item of r.items; track item) {
                <li>{{ item }}</li>
              }
            </ul>
          </section>
        }
      </div>
    </app-dialog>
  `,
})
export class WhatsNewDialogComponent {
  protected readonly whatsNew = inject(WhatsNewService);

  protected date(id: string): string {
    const [y, m, d] = id.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
