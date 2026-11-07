import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { BillingAddon, BillingApi, PaymentRequestStatus, PaymentRequestView } from '../../core/api/billing.api';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { ConfirmService } from '../../shared/confirm';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { formatDateTime } from '../../shared/format';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { checkLines, statusLabel } from '../billing/billing-text';

/**
 * Consola · Pagos (decisión 302): los comprobantes de Bre-B por revisar con lo que Aska vio, aprobar o rechazar; la
 * llave Bre-B que ven los negocios y el precio de cada adicional.
 */
@Component({
  selector: 'app-platform-billing',
  imports: [FormsModule, ButtonModule, PageHeaderComponent, PesosInputDirective, XaskaIaLogoComponent],
  template: `
    <app-page-header title="Pagos" description="Comprobantes de Bre-B por revisar, tu llave y los precios de los adicionales." />

    <div class="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filtrar pedidos">
      @for (f of filters; track f.label) {
        <button type="button" class="chip" [class.chip-on]="status() === f.value" (click)="setStatus(f.value)">{{ f.label }}</button>
      }
    </div>

    <div class="flex flex-col gap-3 max-w-5xl">
      @for (r of requests(); track r.id) {
        <article class="card p-4 flex flex-col gap-3" [attr.aria-label]="'Pedido ' + r.reference">
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex-1 min-w-56">
              <p class="font-bold">{{ r.tradeName }} <span class="font-mono text-sm text-muted">· {{ r.reference }}</span></p>
              <p class="text-sm text-muted">{{ summary(r) }}</p>
              <p class="text-xs text-muted">Pedido {{ dt(r.createdAt) }}@if (r.proofAt) { · comprobante {{ dt(r.proofAt) }} }</p>
            </div>
            <div class="text-right">
              <p class="text-xl font-extrabold">{{ cop(r.amount) }}</p>
              <p class="text-xs" [class.text-success]="r.status === 'APPROVED'" [class.text-danger]="r.status === 'REJECTED'">{{ label(r.status) }}</p>
            </div>
          </div>
          @if (r.check; as ch) {
            <div class="aska-check">
              <app-xaska-ia-logo size="sm" />
              <div class="flex-1 text-sm">
                <div class="flex flex-wrap gap-x-4 gap-y-1">
                  @for (l of lines(r); track l.text) {
                    <span [class.text-success]="l.ok" [class.text-danger]="!l.ok">
                      <i class="pi text-xs" [class.pi-check]="l.ok" [class.pi-times]="!l.ok" aria-hidden="true"></i> {{ l.text }}</span>
                  }
                </div>
                <p class="text-xs text-muted mt-1">Leyó: {{ cop(ch.amount) }} · "{{ ch.reference }}" · {{ ch.destination }} · {{ ch.date }}</p>
              </div>
            </div>
          } @else if (r.proofAt) {
            <p class="text-sm text-muted">Aska no pudo revisar este comprobante: revísalo tú.</p>
          }
          @if (r.rejectReason) { <p class="text-sm text-danger">Rechazado: {{ r.rejectReason }}</p> }
          @if (r.status === 'SENT' || r.status === 'PENDING') {
            <div class="flex flex-wrap gap-2 items-center">
              @if (r.proofAt) {
                <p-button label="Ver comprobante" icon="pi pi-image" [outlined]="true" (onClick)="viewProof(r)" />
              }
              <input class="field flex-1 min-w-48" [(ngModel)]="reasons[r.id]" maxlength="300"
                     placeholder="Motivo si lo rechazas (lo ve el negocio)" [attr.aria-label]="'Motivo para ' + r.reference" />
              <p-button label="Rechazar" severity="danger" [outlined]="true" [loading]="busy() === r.id" (onClick)="reject(r)" />
              <p-button label="Aprobar" icon="pi pi-check" severity="success" [loading]="busy() === r.id" (onClick)="approve(r)" />
            </div>
          }
        </article>
      } @empty {
        <p class="text-muted">No hay pedidos {{ status() === 'SENT' ? 'por revisar' : 'con este filtro' }}.</p>
      }
    </div>

    <div class="grid gap-4 lg:grid-cols-2 mt-6 max-w-5xl">
      <section class="card p-4 flex flex-col gap-3" aria-labelledby="breb-title">
        <h2 id="breb-title" class="font-bold tracking-tight">Tu llave Bre-B</h2>
        <p class="text-xs text-muted">Es lo que ven los negocios para pagarte. Sin llave y titular no pueden armar pedidos.</p>
        <label class="text-sm flex flex-col gap-1">Llave<input class="field font-mono" [(ngModel)]="breb.key" maxlength="64" placeholder="@XASKA o tu celular" /></label>
        <label class="text-sm flex flex-col gap-1">Titular<input class="field" [(ngModel)]="breb.holderName" maxlength="120" /></label>
        <label class="text-sm flex flex-col gap-1">Banco o billetera<input class="field" [(ngModel)]="breb.bankName" maxlength="60" /></label>
        <label class="text-sm flex flex-col gap-1">Nota (opcional)<input class="field" [(ngModel)]="breb.notes" maxlength="300" /></label>
        <p-button label="Guardar llave" [loading]="savingBreb()" (onClick)="saveBreb()" />
      </section>

      <section class="card p-4 flex flex-col gap-2" aria-labelledby="addons-title">
        <h2 id="addons-title" class="font-bold tracking-tight">Precios de los adicionales</h2>
        <p class="text-xs text-muted">Al mes. Vacío = no se vende. Los planes se editan en Planes.</p>
        @for (a of addons(); track a.code) {
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="flex-1 min-w-40">{{ a.name }}</span>
            <input appPesos class="field w-32 text-right" [(ngModel)]="a.monthlyPrice" [attr.aria-label]="'Precio de ' + a.name" />
            <label class="flex items-center gap-1 text-xs"><input type="checkbox" [(ngModel)]="a.active" /> Activo</label>
            <p-button icon="pi pi-check" [text]="true" [attr.aria-label]="'Guardar ' + a.name" (onClick)="saveAddon(a)" />
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .chip { min-height: 2.25rem; padding: 0 0.875rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600;
      border: 1px solid var(--color-line); background: var(--color-surface); }
    .chip-on { background: var(--aska); border-color: var(--aska); color: var(--aska-contrast); }
    .field { min-height: 2.5rem; border-radius: 0.5rem; border: 1px solid var(--color-line); background: var(--color-surface); padding: 0 0.5rem; }
    .aska-check { display: flex; gap: 0.625rem; padding: 0.625rem 0.75rem; border-radius: 0.75rem; background: var(--aska-soft); }
  `,
})
export class PlatformBillingComponent implements OnInit {
  private readonly api = inject(BillingApi);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmService);

  protected readonly filters: { value: PaymentRequestStatus | null; label: string }[] = [
    { value: 'SENT', label: 'Por revisar' },
    { value: 'PENDING', label: 'Sin comprobante' },
    { value: 'APPROVED', label: 'Aprobados' },
    { value: 'REJECTED', label: 'Rechazados' },
    { value: null, label: 'Todos' },
  ];
  protected readonly status = signal<PaymentRequestStatus | null>('SENT');
  protected readonly requests = signal<PaymentRequestView[]>([]);
  protected readonly addons = signal<BillingAddon[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly savingBreb = signal(false);
  protected reasons: Record<string, string> = {};
  protected breb = { key: '', holderName: '', bankName: '', notes: '' };

  ngOnInit(): void {
    this.load();
    this.api.breb().subscribe((b) => (this.breb = { key: b.key, holderName: b.holderName, bankName: b.bankName, notes: b.notes }));
    this.api.adminAddons().subscribe((a) => this.addons.set(a));
  }

  setStatus(s: PaymentRequestStatus | null): void {
    this.status.set(s);
    this.load();
  }

  private load(): void {
    this.api.adminRequests(this.status()).subscribe((r) => this.requests.set(r));
  }

  viewProof(r: PaymentRequestView): void {
    this.api.adminProof(r.id).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  approve(r: PaymentRequestView): void {
    this.confirm.ask({
      header: 'Aprobar pago',
      message: `¿Confirmas que recibiste ${this.cop(r.amount)} de ${r.tradeName} (${r.reference})? Se activa de inmediato.`,
      acceptLabel: 'Aprobar pago',
      accept: () => {
        this.busy.set(r.id);
        this.api.approve(r.id).subscribe({
          next: () => {
            this.busy.set(null);
            this.messages.add({ severity: 'success', summary: 'Pago aprobado', detail: r.tradeName });
            this.load();
          },
          error: () => this.busy.set(null),
        });
      },
    });
  }

  reject(r: PaymentRequestView): void {
    this.busy.set(r.id);
    this.api.reject(r.id, this.reasons[r.id] ?? '').subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
      },
      error: () => this.busy.set(null),
    });
  }

  saveBreb(): void {
    this.savingBreb.set(true);
    this.api.saveBreb(this.breb).subscribe({
      next: (b) => {
        this.savingBreb.set(false);
        this.messages.add({ severity: 'success', summary: b.ready ? 'Llave guardada' : 'Guardado: falta la llave o el titular' });
      },
      error: () => this.savingBreb.set(false),
    });
  }

  saveAddon(a: BillingAddon): void {
    this.api.updateAddon(a.code, { name: a.name, description: a.description, monthlyPrice: a.monthlyPrice, active: a.active })
      .subscribe(() => this.messages.add({ severity: 'success', summary: 'Precio guardado', detail: a.name, life: 2000 }));
  }

  protected summary(r: PaymentRequestView): string {
    const parts: string[] = [];
    if (r.planName) {
      parts.push(`${r.planName} × ${r.periods} ${r.billingCycle === 'ANNUAL' ? 'año(s)' : 'mes(es)'}`);
    }
    r.items.forEach((i) => parts.push(`${i.name}${i.quantity > 1 ? ' × ' + i.quantity : ''} · ${i.months} m`));
    return parts.join(' · ');
  }

  protected lines(r: PaymentRequestView): { ok: boolean; text: string }[] {
    return r.check ? checkLines(r.check, r.reference) : [];
  }

  protected label = statusLabel;

  protected dt(v: string): string {
    return formatDateTime(v);
  }

  protected cop(v: number | null): string {
    return formatCop(v);
  }
}
