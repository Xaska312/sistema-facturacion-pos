import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import {
  BillingCycle, PageResponse, PaymentInput, Plan, Subscription, SubscriptionRow, SubscriptionStatus,
} from '../../core/api/api.models';
import { PlatformApi } from '../../core/api/platform.api';
import { ConfirmService } from '../../shared/confirm';
import { formatDate } from '../../shared/format';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { PesosInputDirective } from '../../shared/forms/pesos-input.directive';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery } from '../../shared/table/table';
import { SUBSCRIPTION_STATUS_LABEL, daysLeftText, limitText, subscriptionStatusKey } from './platform-labels';

interface PaymentDraft {
  planCode: string;
  billingCycle: BillingCycle;
  periods: number | null;
  amount: number | null;
  method: string;
  reference: string;
  notes: string;
}

/** Medios de pago que se registran a mano (sin pasarela). */
export const PAYMENT_METHODS: readonly string[] = ['Transferencia', 'Nequi', 'Daviplata', 'Efectivo', 'Otro'];

/**
 * Suscripciones de todos los negocios (fase 8b): las que vencen primero arriba; ver el detalle, registrar un pago
 * (transferencia, Nequi…) y cambiar de plan.
 */
@Component({
  selector: 'app-platform-subscriptions',
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, FormDialogComponent, PesosInputDirective,
    PageHeaderComponent, StatusBadgeComponent, DataTableComponent, CellTemplateDirective],
  template: `
    <app-page-header title="Suscripciones"
                     description="Plan y vencimiento de cada negocio. Registra aquí los pagos que recibes: el periodo nuevo empieza cuando termina el actual." />

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    caption="Suscripciones de los negocios" searchPlaceholder="Negocio, identificador o correo del dueño"
                    emptyIcon="pi pi-credit-card" emptyTitle="No hay suscripciones con estos filtros"
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <span>Estado</span>
        <select class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="status" (ngModelChange)="reloadFirstPage()">
          <option [ngValue]="null">Todos</option>
          @for (option of statusOptions; track option.value) {
            <option [ngValue]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
      <ng-template appCell="business" let-row>
        <div class="flex flex-col">
          <span class="font-medium">{{ row.tradeName }}</span>
          <span class="text-xs text-muted font-mono">{{ row.slug }}</span>
        </div>
      </ng-template>
      <ng-template appCell="owner" let-row>
        <div class="flex flex-col">
          <span>{{ row.ownerName }}</span>
          <span class="text-xs text-muted">{{ row.ownerEmail }}</span>
        </div>
      </ng-template>
      <ng-template appCell="ends" let-row>
        <div class="flex flex-col">
          <span>{{ date(row.endsAt) }}</span>
          <span class="text-xs" [class.text-danger]="row.daysLeft === 0" [class.text-muted]="row.daysLeft > 0">
            {{ daysLeft(row.daysLeft) }}
          </span>
        </div>
      </ng-template>
      <ng-template #actions let-row>
        <p-button label="Ver" icon="pi pi-eye" size="small" [text]="true" (onClick)="open(row)"
                  [ariaLabel]="'Ver la suscripción de ' + row.tradeName" />
      </ng-template>
    </app-data-table>

    <p-dialog [header]="'Suscripción de ' + (detail()?.tradeName ?? '')" [(visible)]="detailOpen" [modal]="true"
              [style]="{ width: 'min(44rem, 95vw)' }">
      @if (detail(); as s) {
        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div><dt class="text-muted">Plan</dt><dd class="font-medium">{{ s.plan.name }}{{ s.trial ? ' (prueba)' : '' }}</dd></div>
          <div><dt class="text-muted">Estado</dt>
            <dd><app-status-badge [status]="statusKey(s.status)" [label]="statusLabel[s.status]" /></dd></div>
          <div><dt class="text-muted">Vence</dt><dd>{{ date(s.endsAt) }} · {{ daysLeft(s.daysLeft) }}</dd></div>
          <div><dt class="text-muted">Desde</dt><dd>{{ date(s.startedAt) }}</dd></div>
          <div><dt class="text-muted">Sucursales</dt><dd>{{ s.usage.branches }} de {{ limit(s.plan.maxBranches) }}</dd></div>
          <div><dt class="text-muted">Usuarios</dt><dd>{{ s.usage.users }} de {{ limit(s.plan.maxUsers) }}</dd></div>
        </dl>

        <div class="flex flex-wrap gap-2 mt-4">
          <p-button label="Registrar pago" icon="pi pi-dollar" (onClick)="openPayment(s)" />
          <span class="flex items-center gap-2 text-sm">
            <label for="sub-plan" class="sr-only">Cambiar plan</label>
            <select id="sub-plan" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="newPlan">
              @for (plan of plans(); track plan.code) {
                <option [value]="plan.code">{{ plan.name }}</option>
              }
            </select>
            <p-button label="Cambiar plan" severity="secondary" [outlined]="true"
                      [disabled]="!newPlan || newPlan === s.plan.code" (onClick)="changePlan(s)" />
          </span>
        </div>

        <h3 class="font-medium mt-5 mb-2">Pagos</h3>
        @if (s.payments.length === 0) {
          <p class="text-sm text-muted">Aún no hay pagos registrados.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <caption class="sr-only">Pagos de la suscripción</caption>
              <thead class="bg-surface-alt text-left">
                <tr>
                  <th scope="col" class="p-2">Registrado</th>
                  <th scope="col" class="p-2">Periodo</th>
                  <th scope="col" class="p-2 text-right">Valor</th>
                  <th scope="col" class="p-2">Medio</th>
                  <th scope="col" class="p-2">Referencia y notas</th>
                </tr>
              </thead>
              <tbody>
                @for (p of s.payments; track p.id) {
                  <tr class="border-t">
                    <td class="p-2 whitespace-nowrap">{{ date(p.createdAt) }}</td>
                    <td class="p-2 whitespace-nowrap">{{ date(p.periodStart) }} – {{ date(p.periodEnd) }}</td>
                    <td class="p-2 text-right whitespace-nowrap">{{ cop(p.amount) }}</td>
                    <td class="p-2">{{ p.source === 'CODE' ? 'Código de activación' : p.method }}</td>
                    <td class="p-2">{{ p.reference ?? '' }}{{ p.reference && p.notes ? ' · ' : '' }}{{ p.notes ?? '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </p-dialog>

    <app-form-dialog [(visible)]="paymentOpen" [header]="'Registrar pago de ' + (detail()?.tradeName ?? '')"
                     width="32rem" submitLabel="Registrar pago" submitIcon="pi pi-dollar" [dirty]="paymentDirty()"
                     [invalidMessage]="paymentProblem()" [save]="paymentRequest" successMessage="Pago registrado"
                     (saved)="onPaid($event)"
                     description="El periodo nuevo empieza cuando termina el actual (o hoy, si ya venció). Al dueño le llega un correo de confirmación.">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="pay-plan" class="text-sm font-medium">Plan</label>
            <select id="pay-plan" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="payment.planCode">
              @for (plan of plans(); track plan.code) {
                <option [value]="plan.code">{{ plan.name }}</option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="pay-cycle" class="text-sm font-medium">Ciclo</label>
            <select id="pay-cycle" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="payment.billingCycle">
              <option value="MONTHLY">Mensual</option>
              <option value="ANNUAL">Anual</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="pay-periods" class="text-sm font-medium">{{ payment.billingCycle === 'ANNUAL' ? 'Años' : 'Meses' }}</label>
            <input pInputText id="pay-periods" type="number" min="1" [max]="payment.billingCycle === 'ANNUAL' ? 3 : 36"
                   [(ngModel)]="payment.periods" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="pay-amount" class="text-sm font-medium">Valor recibido</label>
            <input pInputText id="pay-amount" appPesos [(ngModel)]="payment.amount" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label for="pay-method" class="text-sm font-medium">Medio</label>
            <select id="pay-method" class="border rounded-[10px] px-3 min-h-11" [(ngModel)]="payment.method">
              @for (method of methods; track method) {
                <option [value]="method">{{ method }}</option>
              }
            </select>
          </div>
          <div class="flex flex-col gap-1">
            <label for="pay-reference" class="text-sm font-medium">Referencia</label>
            <input pInputText id="pay-reference" maxlength="100" [(ngModel)]="payment.reference"
                   placeholder="Número del comprobante" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label for="pay-notes" class="text-sm font-medium">Notas internas</label>
          <input pInputText id="pay-notes" maxlength="500" [(ngModel)]="payment.notes" />
          <small class="text-muted">Solo las ves tú; el negocio no las ve.</small>
        </div>
      </div>
    </app-form-dialog>
  `,
})
export class PlatformSubscriptionsComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly platform = inject(PlatformApi);
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(MessageService);

  protected readonly page = signal<PageResponse<SubscriptionRow> | null>(null);
  protected readonly loading = signal(true);
  protected readonly plans = signal<Plan[]>([]);
  protected readonly detail = signal<Subscription | null>(null);
  protected status: SubscriptionStatus | null = null;
  protected query: TableQuery = initialQuery();
  protected detailOpen = false;
  protected paymentOpen = false;
  protected newPlan = '';
  protected payment: PaymentDraft = emptyPayment('');
  private paymentSnapshot = '';

  protected readonly methods = PAYMENT_METHODS;
  protected readonly statusLabel = SUBSCRIPTION_STATUS_LABEL;
  protected readonly statusKey = subscriptionStatusKey;
  protected readonly date = formatDate;
  protected readonly cop = formatCop;
  protected readonly daysLeft = daysLeftText;
  protected readonly limit = limitText;
  protected readonly statusOptions = (Object.keys(SUBSCRIPTION_STATUS_LABEL) as SubscriptionStatus[])
    .map((value) => ({ value, label: SUBSCRIPTION_STATUS_LABEL[value] }));

  protected readonly trackById = (row: SubscriptionRow): string => row.tenantId;
  protected readonly columns: ColumnDef<SubscriptionRow>[] = [
    { header: 'Negocio', cell: (s) => s.tradeName, template: 'business' },
    { header: 'Dueño', cell: (s) => s.ownerEmail, template: 'owner', hideOnMobile: true },
    { header: 'Plan', cell: (s) => (s.trial ? `${s.planName} (prueba)` : s.planName) },
    { header: 'Estado', cell: (s) => subscriptionStatusKey(s.status), kind: 'status',
      statusLabel: (s) => SUBSCRIPTION_STATUS_LABEL[s.status] },
    { header: 'Vence', cell: (s) => s.endsAt, template: 'ends' },
  ];

  ngOnInit(): void {
    this.platform.plans().subscribe((plans) => this.plans.set(plans.filter((p) => p.active)));
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.platform.subscriptions(query.search, this.status, query.page, query.size).pipe(this.latest.only())
      .subscribe({
        next: (result) => {
          this.page.set(result);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  reloadFirstPage(): void {
    this.load({ ...this.query, page: 0 });
  }

  open(row: SubscriptionRow): void {
    this.platform.subscription(row.tenantId).subscribe((s) => this.showDetail(s));
  }

  openPayment(s: Subscription): void {
    this.payment = emptyPayment(s.plan.active ? s.plan.code : (this.plans()[0]?.code ?? ''));
    this.paymentSnapshot = JSON.stringify(this.payment);
    this.paymentOpen = true;
  }

  protected paymentDirty(): boolean {
    return JSON.stringify(this.payment) !== this.paymentSnapshot;
  }

  protected paymentProblem(): string | null {
    const p = this.payment;
    if (!p.planCode) {
      return 'Elige el plan.';
    }
    const max = p.billingCycle === 'ANNUAL' ? 3 : 36;
    const periods = Number(p.periods);
    if (p.periods === null || String(p.periods) === '' || !Number.isInteger(periods) || periods < 1 || periods > max) {
      return p.billingCycle === 'ANNUAL' ? 'Se registran de 1 a 3 años.' : 'Se registran de 1 a 36 meses.';
    }
    if (p.amount === null || p.amount < 0) {
      return 'Escribe el valor recibido.';
    }
    return null;
  }

  protected readonly paymentRequest = (): Observable<Subscription> => {
    const s = this.detail();
    if (!s) {
      throw new Error('Sin suscripción seleccionada');
    }
    const p = this.payment;
    const input: PaymentInput = {
      planCode: p.planCode,
      billingCycle: p.billingCycle,
      periods: Number(p.periods),
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference.trim() || null,
      notes: p.notes.trim() || null,
    };
    return this.platform.registerPayment(s.tenantId, input);
  };

  onPaid(result: unknown): void {
    this.showDetail(result as Subscription);
    this.load(this.query);
  }

  changePlan(s: Subscription): void {
    const plan = this.plans().find((p) => p.code === this.newPlan);
    if (!plan) {
      return;
    }
    this.confirm.ask({
      header: `Cambiar a ${plan.name}`,
      message: `${s.tradeName} pasa al plan ${plan.name} desde ya. La fecha de fin no cambia.`,
      acceptLabel: 'Cambiar plan',
      accept: () => this.platform.changePlan(s.tenantId, plan.code).pipe(
        tap(() => this.messages.add({ severity: 'success', summary: 'Plan cambiado', detail: plan.name })),
      ).subscribe((updated) => {
        this.showDetail(updated);
        this.load(this.query);
      }),
    });
  }

  private showDetail(s: Subscription): void {
    this.detail.set(s);
    this.newPlan = s.plan.code;
    this.detailOpen = true;
  }
}

function emptyPayment(planCode: string): PaymentDraft {
  return { planCode, billingCycle: 'MONTHLY', periods: 1, amount: null, method: PAYMENT_METHODS[0], reference: '',
    notes: '' };
}
