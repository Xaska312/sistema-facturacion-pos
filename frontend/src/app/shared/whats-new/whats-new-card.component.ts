import { Component, computed, inject } from '@angular/core';
import { WhatsNewService } from './whats-new.service';

/** Tarjeta de Inicio con lo nuevo desde la última vez (decisión 354). "Entendido" la esconde hasta la próxima versión. */
@Component({
  selector: 'app-whats-new-card',
  template: `
    @if (latest(); as r) {
      <section class="card p-4 flex flex-col gap-2" aria-labelledby="whats-new-title">
        <div class="flex flex-wrap items-center gap-2">
          <span class="new-tag">Nuevo</span>
          <h2 id="whats-new-title" class="font-bold">{{ r.title }}</h2>
        </div>
        <ul class="text-sm flex flex-col gap-1 list-disc pl-5">
          @for (item of r.items; track item) {
            <li>{{ item }}</li>
          }
        </ul>
        <div class="flex flex-wrap gap-4 text-sm mt-1">
          <button type="button" class="font-medium text-brand hover:underline" (click)="whatsNew.markSeen()">Entendido</button>
          @if (more() > 0) {
            <button type="button" class="text-muted hover:underline" (click)="whatsNew.show()">
              Ver {{ more() === 1 ? 'otra novedad' : 'otras ' + more() + ' novedades' }}</button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .new-tag { font-size: 0.75rem; font-weight: 800; padding: 0.125rem 0.5rem; border-radius: 9999px;
      background: var(--brand-soft); color: var(--brand-soft-text); }
  `,
})
export class WhatsNewCardComponent {
  protected readonly whatsNew = inject(WhatsNewService);
  protected readonly latest = computed(() => this.whatsNew.unseen()[0] ?? null);
  protected readonly more = computed(() => Math.max(0, this.whatsNew.unseen().length - 1));
}
