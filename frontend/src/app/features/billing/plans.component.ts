import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { BillingCycle } from '../../core/api/api.models';
import { BillingAddon, BillingApi, BillingCatalog, BillingPlan, PaymentRequestView } from '../../core/api/billing.api';
import { AuthService } from '../../core/auth/auth.service';
import { problemMessage } from '../../core/errors/problem';
import { AskaLoaderComponent } from '../../shared/brand/aska-loader.component';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { copyToClipboard } from '../../shared/clipboard';
import { formatDate } from '../../shared/format';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { includedText } from '../platform/plan-features';
import { COUNTABLE, addonsForSale, annualSaving, checkLines, months, orderTotal, planPrice, statusLabel } from './billing-text';

/**
 * Planes y pagos (decisión 302): el negocio ve su plan y lo que compró aparte, prueba XASKA IA gratis una vez, arma su
 * pedido (plan, XASKA IA, módulos y cupos) y lo paga por Bre-B con una referencia; sube el comprobante, Aska lo revisa
 * y XASKA lo aprueba.
 */
@Component({
  selector: 'app-plans',
  imports: [FormsModule, ButtonModule, PageHeaderComponent, XaskaIaLogoComponent, AskaLoaderComponent],
  template: `
    <app-page-header title="Planes y pagos"
                     description="Renueva tu plan, agrega XASKA IA, módulos o más cupos y paga por Bre-B desde la app de tu banco." />

    @if (catalog() === null) {
      <p class="text-muted" role="status">Cargando…</p>
    } @else {
      @let c = catalog()!;
      @let s = c.subscription;
      <div class="grid gap-4 lg:grid-cols-3 max-w-6xl">
        <section class="card p-4 md:p-5 flex flex-col gap-2 lg:col-span-1" aria-labelledby="plan-now">
          <h2 id="plan-now" class="font-bold tracking-tight">Tu plan</h2>
          <p class="text-2xl font-extrabold tracking-tight">{{ s.plan.name }}</p>
          <p class="text-sm" [class.text-danger]="s.status === 'EXPIRED'" [class.text-muted]="s.status !== 'EXPIRED'">
            {{ s.trial ? 'Prueba' : 'Pagado' }} hasta el {{ date(s.endsAt) }}
            @if (s.daysLeft > 0) { · {{ s.daysLeft }} {{ s.daysLeft === 1 ? 'día' : 'días' }} }
          </p>
          <p class="text-xs text-muted">{{ included(s.plan.modules, s.plan.features) }}</p>
          @if (activeAddons().length > 0) {
            <h3 class="text-sm font-semibold mt-2">Comprado aparte</h3>
            <ul class="text-sm flex flex-col gap-1">
              @for (a of activeAddons(); track a.code) {
                <li class="flex justify-between gap-2">
                  <span>{{ a.name }}@if (a.quantity > 1) { × {{ a.quantity }} }
                    @if (a.trial) { <span class="trial-tag">prueba</span> }</span>
                  <span class="text-muted whitespace-nowrap">hasta {{ date(a.endsAt) }}</span>
                </li>
              }
            </ul>
          }
        </section>

        @if (aiAddon(); as ai) {
          <section class="aska-offer lg:col-span-2" aria-labelledby="ai-offer">
            <app-xaska-ia-logo size="xl" />
            <div class="flex-1 min-w-56">
              <h2 id="ai-offer" class="text-lg font-bold tracking-tight">XASKA IA <span class="aska-price">{{ cop(ai.monthlyPrice) }}/mes</span></h2>
              <p class="text-sm aska-offer-text">{{ ai.description }}</p>
              <ul class="aska-offer-list">
                <li>Facturas y listas de precios en foto: sin digitar.</li>
                <li>Pregúntale a Aska cómo va tu negocio.</li>
                <li>Qué comprar y el Resumen del día en tu correo.</li>
              </ul>
            </div>
            <div class="flex flex-col gap-2 items-stretch">
              @if (s.aiTrialAvailable) {
                <button type="button" class="aska-cta" [disabled]="startingTrial()" (click)="startTrial()">
                  {{ startingTrial() ? 'Activando…' : 'Probar 14 días gratis' }}</button>
              }
              @if (!chosen()['AI'] && !aiIncluded()) {
                <button type="button" class="aska-secondary" (click)="choose('AI', 1)">Agregar al pedido</button>
              }
            </div>
          </section>
        }
      </div>

      @if (open(); as r) {
        <section class="card p-4 md:p-5 mt-4 max-w-6xl flex flex-col gap-3 breb" aria-labelledby="pay-now">
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex-1 min-w-56">
              <h2 id="pay-now" class="font-bold tracking-tight">Paga por Bre-B</h2>
              <p class="text-sm text-muted">{{ statusText(r.status) }} · pedido del {{ date(r.createdAt) }}</p>
            </div>
            @if (r.status === 'PENDING') {
              <p-button label="Cancelar pedido" [text]="true" severity="secondary" (onClick)="cancel(r)" />
            }
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="pay-box">
              <span class="text-xs text-muted">1. Valor exacto</span>
              <strong class="text-2xl tracking-tight">{{ cop(r.amount) }}</strong>
              <button type="button" class="copy" (click)="copy(String(r.amount), 'Valor')">Copiar</button>
            </div>
            <div class="pay-box">
              <span class="text-xs text-muted">2. A la llave Bre-B</span>
              <strong class="text-lg font-mono break-all">{{ c.breb.key }}</strong>
              <span class="text-xs text-muted">{{ c.breb.holderName }}@if (c.breb.bankName) { · {{ c.breb.bankName }} }</span>
              <button type="button" class="copy" (click)="copy(c.breb.key, 'Llave')">Copiar</button>
            </div>
            <div class="pay-box pay-ref">
              <span class="text-xs">3. Escribe en la descripción</span>
              <strong class="text-2xl font-mono tracking-wider">{{ r.reference }}</strong>
              <button type="button" class="copy" (click)="copy(r.reference, 'Referencia')">Copiar</button>
            </div>
          </div>
          @if (c.breb.notes) { <p class="text-xs text-muted">{{ c.breb.notes }}</p> }
          <p class="text-xs text-muted">{{ summary(r) }}@if (r.status === 'PENDING') { · El valor se mantiene hasta el {{ date(r.expiresAt) }}. }</p>

          @if (uploading()) {
            <app-aska-loader [messages]="['Leyendo el comprobante…', 'Revisando el valor y la referencia…', 'Casi listo…']" />
          } @else if (r.check !== null) {
            @let ch = r.check!;
            <div class="aska-check">
              <app-xaska-ia-logo size="md" />
              <div class="flex-1">
                <p class="font-semibold text-sm">Aska revisó tu comprobante</p>
                <ul class="text-sm mt-1 flex flex-col gap-0.5">
                  @for (l of lines(r); track l.text) {
                    <li [class.text-success]="l.ok" [class.text-warning]="!l.ok">
                      <i class="pi text-xs" [class.pi-check]="l.ok" [class.pi-exclamation-triangle]="!l.ok" aria-hidden="true"></i>
                      {{ l.text }}</li>
                  }
                </ul>
                <p class="text-xs text-muted mt-1">{{ ch.note }} XASKA lo confirma y te avisa por correo; casi siempre el mismo día.</p>
              </div>
            </div>
          } @else if (r.status === 'SENT') {
            <p class="text-sm">Recibimos tu comprobante. XASKA lo confirma y te avisa por correo.</p>
          }
          @if (r.status === 'PENDING' || r.status === 'SENT') {
            <label class="upload">
              <i class="pi pi-upload" aria-hidden="true"></i>
              {{ r.status === 'SENT' ? 'Subir otro comprobante' : '4. Ya pagué: subir el comprobante' }}
              <input type="file" class="sr-only" accept="image/jpeg,image/png,application/pdf,.pdf" (change)="upload(r, $event)" />
            </label>
          }
        </section>
      }
      @if (lastRejected(); as rj) {
        <p class="mt-4 max-w-6xl text-sm rounded-lg px-3 py-2 bg-danger-soft text-danger-soft-fg" role="status">
          No pudimos confirmar el pago {{ rj.reference }}: {{ rj.rejectReason }} Arma un pedido nuevo o escríbenos.</p>
      }

      <section class="card p-4 md:p-5 mt-4 max-w-6xl flex flex-col gap-4" aria-labelledby="build">
        <h2 id="build" class="font-bold tracking-tight">Arma tu pedido</h2>
        @if (!c.breb.ready) {
          <p class="text-sm text-warning">Los pagos por Bre-B aún no están listos. Escríbenos y te ayudamos a renovar.</p>
        }

        <div class="flex flex-wrap items-center gap-2">
          <div class="seg" role="group" aria-label="Forma de pago">
            <button type="button" [class.seg-on]="cycle() === 'MONTHLY'" (click)="setCycle('MONTHLY')">Mensual</button>
            <button type="button" [class.seg-on]="cycle() === 'ANNUAL'" (click)="setCycle('ANNUAL')">Anual</button>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <span class="text-muted">Por</span>
            <select class="field" [ngModel]="periods()" (ngModelChange)="periods.set(+$event)">
              @for (n of periodOptions(); track n) {
                <option [value]="n">{{ n }} {{ cycle() === 'ANNUAL' ? (n === 1 ? 'año' : 'años') : (n === 1 ? 'mes' : 'meses') }}</option>
              }
            </select>
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Plan">
          <button type="button" class="plan" [class.plan-on]="planCode() === null" role="radio"
                  [attr.aria-checked]="planCode() === null" (click)="planCode.set(null)">
            <span class="font-bold">No cambiar el plan</span>
            <span class="text-xs text-muted">Solo comprar adicionales</span>
          </button>
          @for (p of c.plans; track p.code) {
            <button type="button" class="plan" [class.plan-on]="planCode() === p.code" role="radio"
                    [attr.aria-checked]="planCode() === p.code" (click)="planCode.set(p.code)">
              <span class="font-bold">{{ p.name }}
                @if (p.code === s.plan.code) { <span class="trial-tag">actual</span> }</span>
              <span class="text-lg font-extrabold">{{ cop(price(p)) }}<span class="text-xs font-medium text-muted">/{{ cycle() === 'ANNUAL' ? 'año' : 'mes' }}</span></span>
              @if (cycle() === 'ANNUAL' && saving(p); as pct) { <span class="text-xs text-success">Ahorras {{ pct }} %</span> }
              <span class="text-xs text-muted">{{ limits(p) }}</span>
            </button>
          }
        </div>

        <div class="flex flex-col gap-2">
          <h3 class="text-sm font-semibold">Adicionales</h3>
          @for (a of forSale(); track a.code) {
            <div class="addon" [class.addon-ai]="a.code === 'AI'" [class.addon-on]="qty(a.code) > 0">
              <label class="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                <input type="checkbox" class="mt-1" [checked]="qty(a.code) > 0"
                       (change)="choose(a.code, $any($event.target).checked ? 1 : 0)" />
                <span class="min-w-0">
                  <span class="font-medium flex items-center gap-2">
                    @if (a.code === 'AI') { <app-xaska-ia-logo size="sm" /> }{{ a.name }}</span>
                  <span class="block text-xs text-muted">{{ a.description }}</span>
                </span>
              </label>
              @if (countable(a) && qty(a.code) > 0) {
                <input type="number" min="1" max="20" class="field w-16 text-center" [ngModel]="chosen()[a.code]"
                       (ngModelChange)="choose(a.code, +$event)" [attr.aria-label]="'Cantidad de ' + a.name" />
              }
              <span class="text-sm font-semibold whitespace-nowrap">{{ cop(a.monthlyPrice) }}<span class="text-xs text-muted">/mes</span></span>
            </div>
          }
        </div>

        <div class="total">
          <div class="flex-1">
            <p class="text-xs text-muted">Total por {{ monthsLabel() }}</p>
            <p class="text-2xl font-extrabold tracking-tight">{{ cop(total()) }}</p>
          </div>
          <p-button label="Pagar con Bre-B" icon="pi pi-qrcode" [disabled]="total() <= 0 || !c.breb.ready"
                    [loading]="creating()" (onClick)="create()" />
        </div>
      </section>

      @if (history().length > 0) {
        <section class="card p-4 mt-4 max-w-6xl" aria-labelledby="history">
          <h2 id="history" class="font-bold tracking-tight mb-2">Tus pedidos</h2>
          <ul class="text-sm divide-y divide-line">
            @for (r of history(); track r.id) {
              <li class="py-2 flex flex-wrap justify-between gap-2">
                <span><span class="font-mono">{{ r.reference }}</span> · {{ summary(r) }}</span>
                <span class="text-muted">{{ cop(r.amount) }} · {{ statusText(r.status) }}</span>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `
    .aska-offer {
      display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.25rem; border-radius: 1.25rem;
      color: var(--xaska-panel-fg); background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
      box-shadow: 0 14px 34px var(--aska-shadow);
    }
    .aska-offer-text { color: var(--xaska-panel-muted); }
    .aska-offer-list { margin-top: 0.5rem; font-size: 0.8125rem; display: flex; flex-direction: column; gap: 0.125rem; }
    .aska-offer-list li::before { content: '✦ '; color: var(--aska-amber); }
    .aska-price { font-size: 0.875rem; font-weight: 700; color: var(--aska-amber); margin-left: 0.375rem; }
    .aska-cta {
      min-height: 2.75rem; padding: 0 1.125rem; border-radius: 0.75rem; font-weight: 800; font-size: 0.875rem;
      color: var(--xaska-ia-tag-text); background: var(--xaska-panel-tile); border: 1px solid var(--aska-amber);
      box-shadow: 0 0 18px var(--xaska-ia-halo);
    }
    .aska-secondary {
      min-height: 2.75rem; padding: 0 1.125rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem;
      color: var(--xaska-panel-fg); border: 1px solid var(--xaska-panel-line);
    }
    .trial-tag {
      font-size: 0.6875rem; font-weight: 700; padding: 0.0625rem 0.4375rem; border-radius: 9999px; margin-left: 0.25rem;
      background: var(--aska-soft); color: var(--aska-soft-fg);
    }
    .breb { border-top: 4px solid var(--aska); }
    .pay-box {
      display: flex; flex-direction: column; gap: 0.25rem; padding: 0.875rem; border-radius: 0.875rem;
      border: 1px solid var(--color-line); background: var(--color-surface-alt);
    }
    .pay-ref { border-color: var(--aska); background: var(--aska-soft); color: var(--aska-soft-fg); }
    .copy { align-self: flex-start; font-size: 0.75rem; font-weight: 700; text-decoration: underline; }
    .aska-check { display: flex; gap: 0.75rem; padding: 0.875rem; border-radius: 0.875rem; background: var(--aska-soft); border: 1px solid var(--aska-line); }
    .upload {
      display: inline-flex; align-items: center; gap: 0.5rem; align-self: flex-start; min-height: 2.75rem; padding: 0 1rem;
      border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; cursor: pointer;
      color: var(--aska-contrast); background: var(--aska);
    }
    .upload:focus-within { outline: 2px solid var(--aska-amber); outline-offset: 2px; }
    .seg { display: inline-flex; padding: 0.25rem; border-radius: 0.75rem; background: var(--color-surface-alt); }
    .seg button { min-height: 2.25rem; padding: 0 0.875rem; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 600; }
    .seg-on { background: var(--color-surface); box-shadow: 0 1px 3px var(--aska-glow); }
    .field { min-height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--color-line); background: var(--color-surface); padding: 0 0.5rem; }
    .plan {
      display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem; padding: 0.875rem; text-align: left;
      border-radius: 0.875rem; border: 1.5px solid var(--color-line); background: var(--color-surface);
    }
    .plan-on { border-color: var(--aska); background: var(--aska-soft); }
    .addon {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem; border-radius: 0.75rem;
      border: 1px solid var(--color-line);
    }
    .addon-on { border-color: var(--aska); }
    .addon-ai { background: var(--aska-soft); }
    .total {
      position: sticky; bottom: 0.75rem; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
      border-radius: 1rem; background: var(--color-surface); border: 1px solid var(--color-line); box-shadow: 0 8px 24px var(--aska-glow);
    }
  `,
})
export class PlansComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  protected readonly String = String;
  protected readonly catalog = signal<BillingCatalog | null>(null);
  protected readonly cycle = signal<BillingCycle>('MONTHLY');
  protected readonly periods = signal(1);
  protected readonly planCode = signal<string | null>(null);
  protected readonly chosen = signal<Record<string, number>>({});
  protected readonly creating = signal(false);
  protected readonly uploading = signal(false);
  protected readonly startingTrial = signal(false);

  protected readonly plan = computed(() => this.catalog()?.plans.find((p) => p.code === this.planCode()) ?? null);
  /** Lo que trae el plan que quedará (el elegido o el actual). */
  private readonly includedCodes = computed(() => {
    const c = this.catalog();
    const p = this.plan() ?? c?.subscription.plan;
    return p ? [...p.modules, ...p.features] : [];
  });
  protected readonly forSale = computed(() => addonsForSale(this.catalog()?.addons ?? [], this.includedCodes()));
  protected readonly aiAddon = computed(() => this.catalog()?.addons.find((a) => a.code === 'AI' && a.monthlyPrice !== null) ?? null);
  protected readonly aiIncluded = computed(() => this.includedCodes().includes('AI'));
  protected readonly total = computed(() => orderTotal(this.plan(), this.cycle(), this.periods(), this.forSale(), this.chosen()));
  protected readonly periodOptions = computed(() => this.cycle() === 'ANNUAL' ? [1, 2, 3] : [1, 2, 3, 6, 12]);
  protected readonly monthsLabel = computed(() => {
    const m = months(this.cycle(), this.periods());
    return m % 12 === 0 && m >= 12 ? `${m / 12} ${m === 12 ? 'año' : 'años'}` : `${m} ${m === 1 ? 'mes' : 'meses'}`;
  });
  protected readonly activeAddons = computed(() => this.catalog()?.subscription.addons.filter((a) => a.active) ?? []);
  protected readonly open = computed(() => this.catalog()?.requests.find((r) => r.status === 'PENDING' || r.status === 'SENT') ?? null);
  protected readonly lastRejected = computed(() => {
    const first = this.catalog()?.requests.find((r) => r.status !== 'CANCELLED');
    return first?.status === 'REJECTED' ? first : null;
  });
  protected readonly history = computed(() => this.catalog()?.requests.filter((r) => r.status !== 'CANCELLED') ?? []);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.catalog().subscribe((c) => {
      this.catalog.set(c);
      if (this.planCode() === null && c.subscription.trial) {
        // En la prueba, lo normal es elegir un plan: se sugiere el que ya usa.
        this.planCode.set(c.plans.some((p) => p.code === c.subscription.plan.code) ? c.subscription.plan.code : null);
      }
    });
  }

  setCycle(cycle: BillingCycle): void {
    this.cycle.set(cycle);
    this.periods.set(1);
  }

  choose(code: string, qty: number): void {
    this.chosen.update((c) => ({ ...c, [code]: Math.max(0, Math.min(20, Math.floor(qty) || 0)) }));
  }

  protected qty(code: string): number {
    return this.chosen()[code] || 0;
  }

  protected countable(a: BillingAddon): boolean {
    return COUNTABLE.has(a.kind);
  }

  create(): void {
    if (this.total() <= 0 || this.creating()) {
      return;
    }
    this.creating.set(true);
    const sale = new Set(this.forSale().map((a) => a.code));
    this.api.createRequest({
      planCode: this.planCode(), billingCycle: this.cycle(), periods: this.periods(),
      addons: Object.entries(this.chosen()).filter(([code, q]) => q > 0 && sale.has(code))
        .map(([code, quantity]) => ({ code, quantity })),
    }).subscribe({
      next: () => {
        this.creating.set(false);
        this.chosen.set({});
        this.load();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => this.creating.set(false),
    });
  }

  cancel(r: PaymentRequestView): void {
    this.api.cancel(r.id).subscribe(() => this.load());
  }

  upload(r: PaymentRequestView, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (!file) {
      return;
    }
    this.uploading.set(true);
    this.api.uploadProof(r.id, file).subscribe({
      next: () => {
        this.uploading.set(false);
        this.load();
      },
      error: (e: unknown) => {
        this.uploading.set(false);
        if (e instanceof HttpErrorResponse && e.status >= 500) {
          this.messages.add({ severity: 'error', summary: 'No se pudo subir', detail: problemMessage(e) });
        }
      },
    });
  }

  startTrial(): void {
    this.startingTrial.set(true);
    this.api.startAiTrial().subscribe({
      next: () => {
        // Los permisos de XASKA IA llegan con una sesión nueva.
        this.auth.renew().subscribe(() => {
          this.startingTrial.set(false);
          this.messages.add({ severity: 'success', summary: 'XASKA IA activa por 14 días',
            detail: 'Toca el botón de Aska abajo a la derecha para empezar.', life: 6000 });
          this.load();
        });
      },
      error: () => this.startingTrial.set(false),
    });
  }

  async copy(text: string, what: string): Promise<void> {
    if (await copyToClipboard(text)) {
      this.messages.add({ severity: 'success', summary: `${what} copiad${what === 'Llave' || what === 'Referencia' ? 'a' : 'o'}`, life: 2000 });
    }
  }

  protected price(p: BillingPlan): number | null {
    return planPrice(p, this.cycle());
  }

  protected saving(p: BillingPlan): number | null {
    return annualSaving(p);
  }

  protected limits(p: BillingPlan): string {
    const n = (v: number | null, one: string, many: string): string => v === null ? `${many} sin límite` : `${v} ${v === 1 ? one : many}`;
    return [n(p.maxBranches, 'sede', 'sedes'), n(p.maxRegisters, 'caja', 'cajas'), n(p.maxUsers, 'usuario', 'usuarios')].join(' · ');
  }

  protected summary(r: PaymentRequestView): string {
    const parts: string[] = [];
    if (r.planName) {
      parts.push(`${r.planName} por ${r.billingCycle === 'ANNUAL' ? r.periods + (r.periods === 1 ? ' año' : ' años') : r.periods + (r.periods === 1 ? ' mes' : ' meses')}`);
    }
    r.items.forEach((i) => parts.push(`${i.name}${i.quantity > 1 ? ' × ' + i.quantity : ''} por ${i.months} ${i.months === 1 ? 'mes' : 'meses'}`));
    return parts.join(', ');
  }

  protected lines(r: PaymentRequestView): { ok: boolean; text: string }[] {
    return r.check ? checkLines(r.check, r.reference) : [];
  }

  protected statusText = statusLabel;

  protected included(modules: string[], features: string[]): string {
    return includedText(modules, features);
  }

  protected date(v: string): string {
    return formatDate(v);
  }

  protected cop(v: number | null): string {
    return formatCop(v);
  }
}
