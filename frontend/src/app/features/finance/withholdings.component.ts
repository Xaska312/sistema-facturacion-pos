import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Observable, tap } from 'rxjs';
import { PageResponse } from '../../core/api/api.models';
import {
  CertificateFilter,
  Withholding,
  WithholdingCustomerTotal,
  WithholdingFilters,
  WithholdingSummary,
  WithholdingType,
  WithholdingsApi,
} from '../../core/api/withholdings.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { saveDownload } from '../../shared/download';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { PeriodFilterComponent } from '../../shared/period-filter.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { formatDay } from '../orders/order-text';
import { PeriodSelection, periodLabel, resolvePeriod } from '../reports/periods';
import { WITHHOLDING_TYPES, certificateBadge, rateText, typeLabel } from './withholding-text';

/**
 * Retenciones (Finanzas parte B, decisión 322): lo que los clientes te retuvieron en el periodo, por tipo y por
 * cliente, y el "certificado recibido" para no perder ninguno cuando llegue la hora de declarar.
 */
@Component({
  selector: 'app-withholdings',
  imports: [FormsModule, ButtonComponent, AppInputDirective, PageHeaderComponent, PeriodFilterComponent, StatCardComponent,
    StatusBadgeComponent, DataTableComponent, CellTemplateDirective, FormDialogComponent],
  template: `
    <app-page-header title="Retenciones" glyph="withholdings"
                     description="Lo que tus clientes te retuvieron al pagarte (retefuente, reteICA, reteIVA). Esa plata ya la pagaron a tu nombre: la descuentas al declarar con el certificado que te dan.">
      <app-button label="Exportar" icon="pi pi-download" severity="secondary" [outlined]="true" [loading]="exporting()"
                (clicked)="export()" />
    </app-page-header>

    <app-period-filter [selection]="period()" [options]="['thisMonth', 'lastMonth', 'last30', 'custom']"
                       [branches]="[]" [showBranch]="false" (selectionChange)="setPeriod($event)" />

    @if (summary(); as s) {
      <section class="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4" aria-label="Totales del periodo">
        <app-stat-card label="Te retuvieron" [value]="cop(s.total)" icon="pi pi-percentage"
                       [hint]="s.count === 1 ? '1 retención' : s.count + ' retenciones'" />
        @for (t of typeCards(); track t.type) {
          <app-stat-card [label]="t.label" [value]="cop(t.total)" icon="pi pi-file" [hint]="t.hint" />
        }
      </section>
      @if (s.pendingCertificates > 0) {
        <p class="mt-3 text-sm rounded-lg bg-warning-soft text-warning-soft-fg p-3" role="status">
          Faltan {{ s.pendingCertificates }} {{ s.pendingCertificates === 1 ? 'certificado' : 'certificados' }}
          por {{ cop(s.pendingTotal) }}. Pídeselos a tus clientes: sin certificado no puedes descontar esa retención.
        </p>
      }

      @if (s.byCustomer.length > 0) {
        <section class="card p-4 mt-4" aria-labelledby="by-customer">
          <h2 id="by-customer" class="font-bold tracking-tight mb-1">Por cliente</h2>
          <p class="text-xs text-muted mb-3">{{ label() }}. Toca un cliente para ver solo sus retenciones.</p>
          <ul class="flex flex-col">
            @for (c of s.byCustomer; track c.customerId) {
              <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-t border-line first:border-t-0">
                <button type="button" class="flex-1 min-w-48 text-left" (click)="filterCustomer(c.customerId)">
                  <span class="font-medium" [class.text-brand]="customerId() === c.customerId">{{ c.name }}</span>
                  <span class="block text-xs text-muted">{{ c.document }} · {{ c.count }}
                    {{ c.count === 1 ? 'retención' : 'retenciones' }}</span>
                </button>
                <span class="font-semibold tabular-nums">{{ cop(c.total) }}</span>
                @if (c.pendingCertificates > 0) {
                  <app-status-badge status="pending" [label]="c.pendingCertificates + ' sin certificado'" />
                  @if (canManage()) {
                    <app-button label="Llegó el certificado" size="small" [text]="true" icon="pi pi-check"
                              (clicked)="askCertificate(c)" />
                  }
                } @else {
                  <app-status-badge status="completed" label="Certificados al día" />
                }
              </li>
            }
          </ul>
        </section>
      }
    }

    <section class="card p-3 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm" aria-label="Filtros del listado">
      <label class="flex items-center gap-2">
        <span class="text-muted">Tipo</span>
        <select class="border rounded-md px-2 py-1.5" [ngModel]="type() ?? ''" (ngModelChange)="setType($event)">
          <option value="">Todos</option>
          @for (t of types; track t.type) { <option [value]="t.type">{{ t.label }}</option> }
        </select>
      </label>
      <label class="flex items-center gap-2">
        <span class="text-muted">Certificado</span>
        <select class="border rounded-md px-2 py-1.5" [ngModel]="certificate() ?? ''" (ngModelChange)="setCertificate($event)">
          <option value="">Todos</option>
          <option value="PENDING">Pendiente</option>
          <option value="RECEIVED">Recibido</option>
        </select>
      </label>
      <label class="flex items-center gap-2 min-h-9 cursor-pointer">
        <input type="checkbox" [ngModel]="includeVoided()" (ngModelChange)="setVoided($event)" />
        Ver las de ventas anuladas
      </label>
      @if (customerId() || type() || certificate() || includeVoided()) {
        <app-button label="Quitar filtros" size="small" [text]="true" icon="pi pi-filter-slash" (clicked)="clearFilters()" />
      }
    </section>

    <div class="mt-4">
      <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                      caption="Retenciones" emptyIcon="pi pi-percentage" emptyTitle="Sin retenciones en este periodo"
                      emptyMessage="Cuando un cliente te retenga al pagar, regístralo en el cobro con &quot;El cliente retuvo&quot;. Aparece aquí."
                      (queryChange)="load($event)">
        <ng-template appCell="customer" let-row>
          <span class="font-medium">{{ row.customerName }}</span>
          <span class="block text-xs text-muted">{{ row.origin }}</span>
        </ng-template>
        <ng-template appCell="type" let-row>
          <span>{{ typeName(row.type) }} {{ rate(row.rate) }}</span>
          <span class="block text-xs text-muted">de {{ cop(row.base) }}</span>
        </ng-template>
        <ng-template appCell="amount" let-row>
          <span class="font-semibold tabular-nums" [class.line-through]="row.voided"
                [class.text-danger]="row.reversal">{{ cop(row.amount) }}</span>
        </ng-template>
        <ng-template appCell="status" let-row>
          <app-status-badge [status]="badge(row).key" [label]="badge(row).label" />
          @if (row.certificateNote) { <span class="block text-xs text-muted">{{ row.certificateNote }}</span> }
        </ng-template>
        <ng-template #actions let-row>
          @if (canManage() && !row.reversal && !row.voided) {
            <app-button size="small" [text]="true" [icon]="row.certificateReceived ? 'pi pi-undo' : 'pi pi-check'"
                      [label]="row.certificateReceived ? 'Desmarcar' : 'Certificado'" (clicked)="toggleOne(row)" />
          }
        </ng-template>
      </app-data-table>
    </div>

    @if (certifying(); as c) {
      <app-form-dialog [(visible)]="certificateOpen" header="Llegó el certificado" width="28rem"
                       submitLabel="Marcar recibido" [dirty]="note.trim().length > 0" [save]="certificateRequest"
                       [successMessage]="null" (saved)="onCertified()">
        <p class="text-sm">{{ c.name }}: {{ c.pendingCertificates }}
          {{ c.pendingCertificates === 1 ? 'retención' : 'retenciones' }} por {{ cop(c.pendingTotal) }} de {{ label() }}
          quedan con el certificado recibido.</p>
        <label class="flex flex-col gap-1">
          <span class="text-sm font-medium">Nota <span class="text-muted font-normal">(opcional)</span></span>
          <input appInput name="note" maxlength="255" [(ngModel)]="note" placeholder="Ej.: certificado del bimestre 5" />
        </label>
      </app-form-dialog>
    }
  `,
})
export class WithholdingsComponent implements OnInit {
  private readonly latest = new LatestRequest();
  private readonly latestSummary = new LatestRequest();
  private readonly api = inject(WithholdingsApi);
  private readonly messages = inject(MessageService);
  protected readonly canManage = permissionFlag('finance:manage');

  protected readonly period = signal<PeriodSelection>({ period: 'thisMonth', from: null, to: null, branchId: null });
  protected readonly customerId = signal<string | null>(null);
  protected readonly type = signal<WithholdingType | null>(null);
  protected readonly certificate = signal<CertificateFilter | null>(null);
  protected readonly includeVoided = signal(false);
  protected readonly filters = computed<WithholdingFilters>(() => {
    const range = resolvePeriod(this.period());
    return { from: range.from, to: range.to, customerId: this.customerId(), type: this.type(),
      certificate: this.certificate(), includeVoided: this.includeVoided() };
  });
  protected readonly label = computed(() => periodLabel(this.period(), resolvePeriod(this.period())));

  protected readonly page = signal<PageResponse<Withholding> | null>(null);
  protected readonly summary = signal<WithholdingSummary | null>(null);
  /** Una tarjeta por tipo, aunque no haya (así se ve que no hubo reteICA, por ejemplo). */
  protected readonly typeCards = computed(() => {
    const s = this.summary();
    return WITHHOLDING_TYPES.map((t) => {
      const found = s?.byType.find((b) => b.type === t.type);
      return { type: t.type, label: t.label, total: found?.total ?? 0,
        hint: found ? `${found.count} ${found.count === 1 ? 'retención' : 'retenciones'}` : 'Ninguna' };
    });
  });
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  private query: TableQuery = initialQuery();

  protected readonly certifying = signal<WithholdingCustomerTotal | null>(null);
  protected certificateOpen = false;
  protected note = '';

  protected readonly types = WITHHOLDING_TYPES;
  protected readonly cop = formatCop;
  protected readonly typeName = typeLabel;
  protected readonly rate = rateText;
  protected readonly badge = certificateBadge;
  protected readonly trackById = (row: Withholding): string => row.id;
  protected readonly columns: ColumnDef<Withholding>[] = [
    { header: 'Fecha', cell: (w) => formatDay(w.date), cellClass: 'whitespace-nowrap' },
    { header: 'Cliente', cell: (w) => w.customerName, template: 'customer' },
    { header: 'Retención', cell: (w) => typeLabel(w.type), template: 'type' },
    { header: 'Valor', cell: (w) => w.amount, kind: 'money', template: 'amount' },
    { header: 'Certificado', cell: (w) => w.certificateReceived ? 'Recibido' : 'Pendiente', template: 'status' },
    { header: 'Registró', cell: (w) => w.createdByName, hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.loadSummary();
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.list(toPageQuery(query), this.filters()).pipe(this.latest.only()).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadSummary(): void {
    this.api.summary(this.filters()).pipe(this.latestSummary.only()).subscribe((s) => this.summary.set(s));
  }

  private refresh(): void {
    this.loadSummary();
    this.load({ ...this.query, page: 0 });
  }

  protected setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.refresh();
  }

  protected setType(value: string): void {
    this.type.set(value === 'RETEFUENTE' || value === 'RETEICA' || value === 'RETEIVA' ? value : null);
    this.refresh();
  }

  protected setCertificate(value: string): void {
    this.certificate.set(value === 'PENDING' || value === 'RECEIVED' ? value : null);
    this.refresh();
  }

  protected setVoided(value: boolean): void {
    this.includeVoided.set(value);
    this.load({ ...this.query, page: 0 });
  }

  /** Tocar el cliente ya elegido quita el filtro. */
  protected filterCustomer(id: string): void {
    this.customerId.set(this.customerId() === id ? null : id);
    this.refresh();
  }

  protected clearFilters(): void {
    this.customerId.set(null);
    this.type.set(null);
    this.certificate.set(null);
    this.includeVoided.set(false);
    this.refresh();
  }

  protected export(): void {
    this.exporting.set(true);
    this.api.csv(this.filters()).subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, 'retenciones.csv');
      },
      error: () => this.exporting.set(false),
    });
  }

  protected askCertificate(customer: WithholdingCustomerTotal): void {
    this.certifying.set(customer);
    this.note = '';
    this.certificateOpen = true;
  }

  /** Las retenciones sin certificado de ese cliente en el periodo (hasta 500). */
  protected readonly certificateRequest = (): Observable<{ updated: number }> => {
    const customer = this.certifying()!;
    const filters: WithholdingFilters = { ...this.filters(), customerId: customer.customerId, certificate: 'PENDING',
      type: null, includeVoided: false };
    return new Observable<{ updated: number }>((subscriber) => {
      this.api.list({ page: 0, size: 100 }, filters).subscribe({
        next: (first) => {
          const ids = first.content.filter((w) => !w.reversal).map((w) => w.id);
          if (ids.length === 0) {
            subscriber.next({ updated: 0 });
            subscriber.complete();
            return;
          }
          this.api.certificate(ids, true, this.note.trim() || null).subscribe(subscriber);
        },
        error: (e) => subscriber.error(e),
      });
    }).pipe(tap((r) => this.messages.add({ severity: 'success', summary: 'Certificado recibido',
      detail: `${r.updated} ${r.updated === 1 ? 'retención marcada' : 'retenciones marcadas'}`, life: 3000 })));
  };

  protected onCertified(): void {
    this.refresh();
  }

  protected toggleOne(row: Withholding): void {
    this.api.certificate([row.id], !row.certificateReceived, null).subscribe(() => this.refresh());
  }
}
