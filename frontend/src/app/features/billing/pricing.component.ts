import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BillingApi, PublicPricing } from '../../core/api/billing.api';
import { BillingCycle } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { formatCop } from '../../shared/money';
import { includedText } from '../platform/plan-features';
import { annualSaving, planPrice } from './billing-text';

/**
 * Planes y precios sin iniciar sesión (decisión 303): lo que cuesta cada plan y cada adicional, con los precios de la
 * consola, y el camino para empezar (crear cuenta, probar gratis o pagar ya con Bre-B).
 */
@Component({
  selector: 'app-pricing',
  imports: [RouterLink, XaskaIaLogoComponent],
  template: `
    <main class="pricing-page">
      <header class="flex flex-wrap items-center gap-3 mb-8">
        <a routerLink="/login" class="font-extrabold text-xl tracking-tight">XASKA <span class="pos-tag">POS</span></a>
        <span class="flex-1"></span>
        @if (loggedIn()) {
          <a routerLink="/app" class="link-btn">Ir a mi negocio</a>
        } @else {
          <a routerLink="/login" class="link-btn">Entrar</a>
          <a routerLink="/registro" class="cta">Crear cuenta</a>
        }
      </header>

      <section class="text-center max-w-2xl mx-auto mb-8">
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">Planes de XASKA POS</h1>
        <p class="text-muted mt-2">
          @if (data(); as d) { Empieza con {{ d.trialDays }} días gratis con todo incluido, o paga ya con Bre-B desde la app de tu banco. }
          Sin datáfono ni permanencia.
        </p>
        <!-- Decisión 346: probar sin elegir plan (el negocio empieza con la prueba gratis). -->
        @if (data(); as d) {
          <a [routerLink]="loggedIn() ? '/negocios/nuevo' : '/registro'" class="cta mt-4">
            <i class="pi pi-gift mr-2" aria-hidden="true"></i>Probar gratis {{ d.trialDays }} días</a>
          <p class="text-xs text-muted mt-1">Sin tarjeta. Al terminar eliges el plan.</p>
        }
        <div class="seg mt-4" role="group" aria-label="Forma de pago">
          <button type="button" [class.seg-on]="cycle() === 'MONTHLY'" (click)="cycle.set('MONTHLY')">Mensual</button>
          <button type="button" [class.seg-on]="cycle() === 'ANNUAL'" (click)="cycle.set('ANNUAL')">Anual</button>
        </div>
      </section>

      @if (data(); as d) {
        <div class="grid gap-4 md:grid-cols-3 max-w-5xl mx-auto">
          @for (p of d.plans; track p.code; let i = $index) {
            <article class="plan" [class.plan-featured]="i === 1">
              @if (i === 1) { <span class="badge">El más elegido</span> }
              <h2 class="text-xl font-extrabold">{{ p.name }}</h2>
              <p><span class="text-3xl font-extrabold tracking-tight">{{ cop(price(p)) }}</span>
                <span class="text-muted text-sm">/{{ cycle() === 'ANNUAL' ? 'año' : 'mes' }}</span></p>
              @if (cycle() === 'ANNUAL' && saving(p); as pct) { <p class="text-sm text-success">Ahorras {{ pct }} %</p> }
              <ul class="text-sm flex flex-col gap-1 mt-2">
                <li>{{ limit(p.maxBranches, 'sede', 'sedes') }} · {{ limit(p.maxRegisters, 'caja', 'cajas') }} · {{ limit(p.maxUsers, 'usuario', 'usuarios') }}</li>
                <li class="text-muted">Vender, caja, inventario, clientes y reportes{{ extra(p.modules, p.features) }}</li>
              </ul>
              <a [routerLink]="loggedIn() ? '/negocios/nuevo' : '/registro'" [queryParams]="{ plan: p.code, ciclo: cycle() === 'ANNUAL' ? 'anual' : 'mensual' }"
                 class="mt-auto" [class.cta]="i === 1" [class.link-btn]="i !== 1">Empezar con {{ p.name }}</a>
            </article>
          }
        </div>

        @if (ai(); as a) {
          <section class="aska-offer max-w-5xl mx-auto mt-6">
            <app-xaska-ia-logo size="xl" />
            <div class="flex-1 min-w-56">
              <h2 class="text-lg font-bold">XASKA IA <span class="aska-price">{{ cop(a.monthlyPrice) }}/mes</span></h2>
              <p class="text-sm aska-muted">{{ a.description }}</p>
            </div>
            <span class="text-sm aska-muted">Adicional a cualquier plan · pruébala 14 días gratis</span>
          </section>
        }

        @if (others().length > 0) {
          <section class="max-w-5xl mx-auto mt-6">
            <h2 class="font-bold mb-2">Agrega lo que necesites</h2>
            <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              @for (a of others(); track a.code) {
                <div class="addon"><span>{{ a.name }}</span><span class="font-semibold">{{ cop(a.monthlyPrice) }}/mes</span></div>
              }
            </div>
          </section>
        }
      } @else {
        <p class="text-center text-muted" role="status">Cargando precios…</p>
      }
    </main>
  `,
  styles: `
    .pricing-page { max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
    .pos-tag { font-size: 0.6875rem; font-weight: 800; padding: 0.125rem 0.375rem; border-radius: 0.375rem;
      background: var(--xaska-tag-bg); color: var(--xaska-tag-text); vertical-align: middle; }
    .cta { display: inline-flex; justify-content: center; align-items: center; min-height: 2.75rem; padding: 0 1.125rem;
      border-radius: 0.75rem; font-weight: 700; color: var(--aska-contrast); background: var(--aska); }
    .link-btn { display: inline-flex; justify-content: center; align-items: center; min-height: 2.75rem; padding: 0 1.125rem;
      border-radius: 0.75rem; font-weight: 700; border: 1px solid var(--color-line); }
    .seg { display: inline-flex; padding: 0.25rem; border-radius: 0.75rem; background: var(--color-surface-alt); }
    .seg button { min-height: 2.25rem; padding: 0 1rem; border-radius: 0.5rem; font-weight: 600; }
    .seg-on { background: var(--color-surface); box-shadow: 0 1px 3px var(--aska-glow); }
    .plan { position: relative; display: flex; flex-direction: column; gap: 0.25rem; padding: 1.25rem; border-radius: 1.25rem;
      background: var(--color-surface); border: 1px solid var(--color-line); min-height: 18rem; }
    .plan-featured { border: 2px solid var(--aska); box-shadow: 0 14px 34px var(--aska-glow); }
    .badge { position: absolute; top: -0.75rem; left: 1.25rem; font-size: 0.75rem; font-weight: 700; padding: 0.125rem 0.625rem;
      border-radius: 9999px; color: var(--aska-contrast); background: var(--aska); }
    .aska-offer { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.25rem; border-radius: 1.25rem;
      color: var(--xaska-panel-fg); background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to)); }
    .aska-muted { color: var(--xaska-panel-muted); }
    .aska-price { font-size: 0.875rem; color: var(--aska-amber); margin-left: 0.375rem; }
    .addon { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.75rem 1rem; border-radius: 0.75rem;
      border: 1px solid var(--color-line); background: var(--color-surface); font-size: 0.875rem; }
  `,
})
export class PricingComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);

  protected readonly data = signal<PublicPricing | null>(null);
  protected readonly cycle = signal<BillingCycle>('MONTHLY');
  protected readonly loggedIn = computed(() => this.auth.user() !== null);
  protected readonly ai = computed(() => this.data()?.addons.find((a) => a.code === 'AI') ?? null);
  protected readonly others = computed(() => this.data()?.addons.filter((a) => a.code !== 'AI') ?? []);

  ngOnInit(): void {
    this.api.pricing().subscribe((d) => this.data.set(d));
  }

  protected price(p: PublicPricing['plans'][number]): number | null {
    return planPrice(p, this.cycle());
  }

  protected saving(p: PublicPricing['plans'][number]): number | null {
    return annualSaving(p);
  }

  protected limit(v: number | null, one: string, many: string): string {
    return v === null ? `${many} sin límite` : `${v} ${v === 1 ? one : many}`;
  }

  protected extra(modules: string[], features: string[]): string {
    return modules.length + features.length > 0 ? `, más ${includedText(modules, features).toLowerCase()}` : '';
  }

  protected cop(v: number | null): string {
    return formatCop(v);
  }
}
