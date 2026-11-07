import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AiTeaser, BillingApi } from '../../core/api/billing.api';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { formatCop } from '../../shared/money';

/**
 * "Aska encontró…" (decisión 302): a quien no tiene XASKA IA, lo que Aska vería en su negocio, con las cifras reales y
 * los detalles ocultos, y el botón para probarla gratis (una vez) o comprarla. No ocupa espacio si no hay nada.
 */
@Component({
  selector: 'app-aska-teaser',
  imports: [RouterLink, XaskaIaLogoComponent],
  template: `
    @if (teaser(); as t) {
      <section class="teaser" aria-labelledby="teaser-title">
        <app-xaska-ia-logo size="lg" />
        <div class="flex-1 min-w-56">
          <p class="teaser-kicker">Aska encontró en tu negocio</p>
          <h2 id="teaser-title" class="text-lg font-bold tracking-tight">
            @if (t.lowStock > 0) { {{ t.lowStock }} {{ t.lowStock === 1 ? 'producto' : 'productos' }} por agotarse }
            @if (t.lowStock > 0 && t.slowProducts > 0) { y }
            @if (t.slowProducts > 0) { {{ cop(t.slowValue) }} quietos en {{ t.slowProducts }} sin vender hace 60 días }
          </h2>
          <ul class="teaser-locked" aria-hidden="true">
            <li><span class="blur">Producto de ejemplo con nombre largo</span><span class="blur">Pedir 24</span></li>
            <li><span class="blur">Otro producto que se mueve poco</span><span class="blur">$ 380.000</span></li>
          </ul>
          <p class="text-xs teaser-muted">Con XASKA IA, Aska te dice cuáles son, cuánto pedir y qué hacer con lo quieto.</p>
        </div>
        @if (t.canBuy) {
          <div class="flex flex-col gap-2">
            @if (trialAvailable()) {
              <button type="button" class="teaser-cta" [disabled]="starting()" (click)="startTrial()">
                {{ starting() ? 'Activando…' : 'Probar gratis 14 días' }}</button>
            }
            <a routerLink="/app/planes" class="teaser-link">Ver XASKA IA</a>
          </div>
        } @else {
          <p class="text-xs teaser-muted max-w-40">Pídele al dueño del negocio que active XASKA IA.</p>
        }
      </section>
    }
  `,
  styles: `
    .teaser {
      display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.125rem 1.25rem; border-radius: 1.25rem;
      color: var(--xaska-panel-fg); background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
      box-shadow: 0 14px 34px var(--aska-shadow);
    }
    .teaser-kicker { font-size: 0.75rem; font-weight: 700; color: var(--aska-amber); }
    .teaser-muted { color: var(--xaska-panel-muted); }
    .teaser-locked { margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.375rem; }
    .teaser-locked li {
      display: flex; justify-content: space-between; gap: 1rem; padding: 0.375rem 0.625rem; border-radius: 0.5rem;
      background: var(--xaska-panel-tile); font-size: 0.8125rem;
    }
    .blur { filter: blur(5px); user-select: none; }
    .teaser-cta {
      min-height: 2.75rem; padding: 0 1.125rem; border-radius: 0.75rem; font-weight: 800; font-size: 0.875rem;
      color: var(--xaska-ia-tag-text); background: var(--xaska-panel-tile); border: 1px solid var(--aska-amber);
      box-shadow: 0 0 18px var(--xaska-ia-halo);
    }
    .teaser-link { text-align: center; font-size: 0.8125rem; font-weight: 700; text-decoration: underline; }
  `,
})
export class AskaTeaserComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  protected readonly teaser = signal<AiTeaser | null>(null);
  protected readonly trialAvailable = signal(false);
  protected readonly starting = signal(false);

  ngOnInit(): void {
    this.api.teaser().subscribe({
      next: (t) => {
        this.teaser.set(t.show ? t : null);
        if (t.show && t.canBuy) {
          this.api.catalog().subscribe({ next: (c) => this.trialAvailable.set(c.subscription.aiTrialAvailable), error: () => undefined });
        }
      },
      error: () => this.teaser.set(null),
    });
  }

  startTrial(): void {
    this.starting.set(true);
    this.api.startAiTrial().subscribe({
      next: () => this.auth.renew().subscribe(() => {
        this.starting.set(false);
        this.teaser.set(null);
        this.messages.add({ severity: 'success', summary: 'XASKA IA activa por 14 días',
          detail: 'Toca el botón de Aska abajo a la derecha y pregúntale qué productos se van a agotar.', life: 7000 });
        void this.router.navigateByUrl('/app');
      }),
      error: () => this.starting.set(false),
    });
  }

  protected cop(v: number): string {
    return formatCop(v);
  }
}
