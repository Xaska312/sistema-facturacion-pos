import { Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { AskaState } from './aska-state';
import { AskaTrialState } from './aska-trial-state';
import { challengesDone, daysLeftText } from './aska-trial';

/**
 * Bienvenida de la prueba gratis de XASKA IA (decisión 311): qué hace Aska, los días que quedan y tres retos que se
 * marcan solos al hacerlos (leer una factura, preguntarle qué se agota, cargar el cuaderno).
 */
@Component({
  selector: 'app-aska-welcome',
  imports: [DialogModule, XaskaIaLogoComponent],
  template: `
    <p-dialog [visible]="state.welcomeOpen()" (visibleChange)="state.welcomeOpen.set($event)" [modal]="true"
              [dismissableMask]="true" [showHeader]="false" [style]="{ width: '30rem', maxWidth: '94vw' }"
              styleClass="aska-welcome-dialog">
      @if (state.trial(); as t) {
        <div class="welcome-head">
          <app-xaska-ia-logo size="lg" />
          <div>
            <p class="welcome-kicker">{{ days() }} de XASKA IA</p>
            <h2 class="welcome-title">Hola, soy Aska. Ponme a trabajar.</h2>
          </div>
        </div>
        <p class="text-sm mt-3">Estos 14 días tienes todo: leo tus facturas, cargo tu inventario y te respondo sobre tu
          negocio. Haz estos tres retos y ve lo que te ahorro:</p>
        <ol class="welcome-list">
          <li [class.done]="t.scanned">
            <span class="check" aria-hidden="true">{{ t.scanned ? '✓' : '1' }}</span>
            <div class="flex-1"><p class="font-bold">Tómale foto a una factura de proveedor</p>
              <p class="text-xs text-muted">Yo lleno la compra; tú solo revisas.</p></div>
            @if (!t.scanned) { <button type="button" class="go" (click)="go('/app/compras/nueva')">Ir</button> }
          </li>
          <li [class.done]="t.asked">
            <span class="check" aria-hidden="true">{{ t.asked ? '✓' : '2' }}</span>
            <div class="flex-1"><p class="font-bold">Pregúntame qué se va a agotar</p>
              <p class="text-xs text-muted">Te digo qué pedir y a quién.</p></div>
            @if (!t.asked) { <button type="button" class="go" (click)="ask()">Preguntar</button> }
          </li>
          <li [class.done]="t.loaded">
            <span class="check" aria-hidden="true">{{ t.loaded ? '✓' : '3' }}</span>
            <div class="flex-1"><p class="font-bold">Pásame tu cuaderno o una lista de precios</p>
              <p class="text-xs text-muted">Creo los productos con su cantidad y precio.</p></div>
            @if (!t.loaded) {
              <button type="button" class="go" (click)="go('/app/productos/cargar-con-aska')">Ir</button>
            }
          </li>
        </ol>
        <p class="text-xs text-muted mt-3" aria-live="polite">{{ done() }} de 3 retos hechos.</p>
        <div class="flex justify-end mt-4">
          <button type="button" class="welcome-cta" (click)="state.welcomeOpen.set(false)">
            {{ done() === 0 ? 'Empezar' : 'Seguir' }}</button>
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .welcome-head { display: flex; align-items: center; gap: 0.875rem; }
    .welcome-kicker { font-size: 0.75rem; font-weight: 800; letter-spacing: 0.04em; color: var(--aska-soft-fg); }
    .welcome-title { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
    .welcome-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.875rem; }
    .welcome-list li {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; border-radius: 0.875rem;
      background: var(--aska-soft); border: 1px solid var(--aska-line);
    }
    .welcome-list li.done { background: var(--success-soft); border-color: transparent; }
    .welcome-list li.done .font-bold { text-decoration: line-through; opacity: 0.75; }
    .check {
      flex-shrink: 0; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: 9999px;
      font-weight: 800; font-size: 0.8125rem; color: var(--aska-contrast);
      background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
    }
    .welcome-list li.done .check { background: var(--color-success); }
    .go {
      flex-shrink: 0; min-height: 2.5rem; padding: 0 0.875rem; border-radius: 0.75rem; font-size: 0.8125rem;
      font-weight: 700; color: var(--aska-soft-fg); border: 1.5px solid var(--aska-line); background: var(--surface);
    }
    .welcome-cta {
      min-height: 2.75rem; padding: 0 1.25rem; border-radius: 0.75rem; font-weight: 800; color: var(--aska-contrast);
      background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
    }
  `,
})
export class AskaWelcomeComponent implements OnInit {
  protected readonly state = inject(AskaTrialState);
  private readonly aska = inject(AskaState);
  private readonly router = inject(Router);

  protected readonly days = computed(() => daysLeftText(this.state.trial()?.daysLeft ?? 0));
  protected readonly done = computed(() => {
    const t = this.state.trial();
    return t ? challengesDone(t) : 0;
  });

  ngOnInit(): void {
    this.state.load();
  }

  protected go(url: string): void {
    this.state.welcomeOpen.set(false);
    void this.router.navigateByUrl(url);
  }

  protected ask(): void {
    this.state.welcomeOpen.set(false);
    this.aska.open('¿Qué productos se me van a agotar esta semana y cuánto debo pedir?');
  }
}
