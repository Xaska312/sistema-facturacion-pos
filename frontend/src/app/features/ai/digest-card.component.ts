import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AiApi, Digest } from '../../core/api/ai.api';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { isoDay } from '../orders/order-text';
import { AskaState } from './aska-state';
import { SECTION_ICON, TONE_LABEL, digestTitle, sortPoints } from './digest-text';

/**
 * Tarjeta del Resumen del día de Aska en Inicio (decisión 299): el último resumen (de hoy o de ayer) con lo que el
 * rol de la persona puede ver. No ocupa espacio si no hay resumen.
 */
@Component({
  selector: 'app-digest-card',
  imports: [XaskaIaLogoComponent, XIconComponent],
  template: `
    @if (digest(); as d) {
      <section class="digest" aria-labelledby="digest-title">
        <div class="digest-head">
          <span class="digest-orb" aria-hidden="true"></span>
          <div class="relative flex items-center gap-3">
            <app-xaska-ia-logo size="md" />
            <div class="flex-1 min-w-0">
              <p id="digest-title" class="digest-kicker">{{ title() }} · Aska</p>
              <p class="digest-headline">{{ d.headline }}</p>
            </div>
            <button type="button" class="digest-ask" (click)="ask()">Pregúntale a Aska</button>
          </div>
        </div>
        <div class="digest-body">
          @if (d.figures.length > 0) {
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
              @for (f of d.figures; track $index) {
                <div class="digest-figure">
                  <span class="digest-figure-label">{{ f.label }}</span>
                  <span class="digest-figure-value">{{ f.value }}</span>
                </div>
              }
            </div>
          }
          <ul class="flex flex-col gap-2">
            @for (p of points(); track $index) {
              <li class="digest-point">
                <app-xicon [name]="icon[p.section]" [size]="22" />
                <div class="flex-1 min-w-0">
                  <p class="flex flex-wrap items-center gap-2">
                    <span class="digest-tone" [class]="'digest-tone digest-tone--' + p.tone">{{ tone[p.tone] }}</span>
                    <span class="font-bold">{{ p.title }}</span>
                  </p>
                  <p class="text-sm text-muted mt-0.5">{{ p.detail }}</p>
                </div>
              </li>
            }
          </ul>
        </div>
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    :host:empty { display: none; }
    .digest { overflow: hidden; border-radius: 1.5rem; border: 1px solid var(--aska-line); background: var(--surface); }
    .digest-head {
      position: relative; overflow: hidden; padding: 1.125rem 1.25rem;
      background: linear-gradient(160deg, var(--xaska-panel), var(--xaska-panel-2)); color: var(--xaska-panel-fg);
    }
    .digest-orb {
      position: absolute; right: -3rem; top: -5rem; width: 14rem; height: 14rem; border-radius: 9999px;
      background: var(--xaska-panel-tile); border: 1px solid var(--xaska-panel-line);
    }
    .digest-kicker { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; color: var(--aska-amber); }
    .digest-headline { margin-top: 0.125rem; font-size: 1.125rem; line-height: 1.35; font-weight: 800; letter-spacing: -0.01em; }
    .digest-ask {
      flex-shrink: 0; min-height: 2.5rem; padding: 0 0.875rem; border-radius: 0.75rem; font-size: 0.8125rem;
      font-weight: 700; border: 1px solid var(--xaska-panel-line); color: var(--xaska-panel-fg); background: var(--xaska-panel-tile);
    }
    .digest-ask:hover { background: var(--aska); }
    .digest-body { display: flex; flex-direction: column; gap: 0.875rem; padding: 1rem 1.25rem 1.25rem; }
    .digest-figure { display: flex; flex-direction: column; gap: 0.125rem; padding: 0.625rem 0.75rem; border-radius: 0.875rem; background: var(--aska-soft); }
    .digest-figure-label { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--aska-soft-fg); }
    .digest-figure-value { font-size: 1.125rem; font-weight: 800; }
    .digest-point { display: flex; gap: 0.75rem; padding: 0.625rem 0; border-top: 1px solid var(--surface-border); }
    .digest-point:first-child { border-top: 0; }
    .digest-tone { font-size: 0.6875rem; font-weight: 800; padding: 0.125rem 0.5rem; border-radius: 9999px; }
    .digest-tone--good { background: var(--success-soft); color: var(--success-soft-text); }
    .digest-tone--warning { background: var(--warning-soft); color: var(--warning-soft-text); }
    .digest-tone--bad { background: var(--danger-soft); color: var(--danger-soft-text); }
    .digest-tone--info { background: var(--info-soft); color: var(--info-soft-text); }
    @media (max-width: 639px) {
      .digest-head .relative { flex-wrap: wrap; }
      .digest-ask { width: 100%; }
    }
  `,
})
export class DigestCardComponent implements OnInit {
  private readonly api = inject(AiApi);
  private readonly auth = inject(AuthService);
  private readonly aska = inject(AskaState);

  protected readonly digest = signal<Digest | null>(null);
  protected readonly icon = SECTION_ICON;
  protected readonly tone = TONE_LABEL;
  protected readonly points = computed(() => sortPoints(this.digest()?.points ?? []));
  protected readonly title = computed(() => {
    const d = this.digest();
    return d ? digestTitle(d.date, isoDay(new Date())) : '';
  });

  ngOnInit(): void {
    if (this.auth.hasPermission('ai:ask')) {
      this.api.latestDigest().subscribe({ next: (d) => this.digest.set(d), error: () => this.digest.set(null) });
    }
  }

  protected ask(): void {
    this.aska.open();
  }
}
