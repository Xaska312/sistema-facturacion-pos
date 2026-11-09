import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AiApi, AskaRecap } from '../../core/api/ai.api';
import { recapLines } from './aska-recap';

/**
 * "Lo que hiciste con Aska" en Inicio (decisión 309): al dueño, los primeros 7 días del mes, lo que XASKA IA hizo el
 * mes pasado y el tiempo que le ahorró (estimado, con los supuestos a la vista). No ocupa espacio si no hay.
 */
@Component({
  selector: 'app-aska-recap-card',
  template: `
    @if (recap(); as r) {
      <section class="recap" aria-labelledby="recap-title">
        <div class="recap-head">
          <p class="recap-kicker">{{ r.title }}</p>
          <p id="recap-title" class="recap-saved">Te ahorré {{ r.savedLabel }} <span aria-hidden="true">✦</span></p>
          <p class="recap-sub">de trabajo a mano el mes pasado</p>
        </div>
        <ul class="recap-body">
          @for (l of lines(); track $index) {
            <li><span class="recap-emoji" aria-hidden="true">{{ l.emoji }}</span>{{ l.text }}</li>
          }
        </ul>
        <p class="recap-note">Estimado: unos 30 s por línea de factura, 1 min por producto, 5 min por pregunta y 10 por
          pedido revisado o resumen del día.</p>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .recap { overflow: hidden; border-radius: 1.5rem; border: 1px solid var(--aska-line); background: var(--surface); }
    .recap-head {
      padding: 1.125rem 1.25rem; color: var(--xaska-panel-fg);
      background: linear-gradient(160deg, var(--xaska-panel), var(--xaska-panel-2));
    }
    .recap-kicker { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; color: var(--aska-amber); }
    .recap-saved { margin-top: 0.25rem; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
    .recap-sub { font-size: 0.875rem; color: var(--xaska-panel-muted); }
    .recap-body { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem 1.25rem 0.5rem; }
    .recap-body li { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.5rem 0.75rem; border-radius: 0.75rem; background: var(--aska-soft); }
    .recap-emoji { font-size: 1.125rem; line-height: 1.4; }
    .recap-note { padding: 0 1.25rem 1rem; font-size: 0.75rem; color: var(--text-muted); }
  `,
})
export class AskaRecapCardComponent implements OnInit {
  private readonly api = inject(AiApi);

  protected readonly recap = signal<AskaRecap | null>(null);
  protected readonly lines = computed(() => {
    const r = this.recap();
    return r ? recapLines(r) : [];
  });

  ngOnInit(): void {
    this.api.recap().subscribe({ next: (r) => this.recap.set(r), error: () => this.recap.set(null) });
  }
}
