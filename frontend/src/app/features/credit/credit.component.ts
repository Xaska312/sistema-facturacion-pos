import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CreditAccount, CreditEntry, CreditSummary, PageResponse } from '../../core/api/api.models';
import { CreditApi } from '../../core/api/credit.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { CreditPaymentDialogComponent } from './credit-payment-dialog.component';
import { debtAgeLabel, debtSeverity, whatsAppLink } from './credit-text';

/** Fiados: lo que deben los clientes, por antigüedad; abonos y recordatorio por WhatsApp (decisión 255). */
@Component({
  selector: 'app-credit',
  imports: [FormsModule, RouterLink, ButtonModule, PageHeaderComponent, StatCardComponent, DataTableComponent,
    CellTemplateDirective, CreditPaymentDialogComponent],
  template: `
    <app-page-header title="Fiados"
                     description="Lo que te deben tus clientes. Recibe abonos y recuérdales por WhatsApp." />

    @if (summary(); as s) {
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <app-stat-card label="Por cobrar" [value]="cop(s.totalBalance)" icon="pi pi-book"
                       [hint]="s.customers + (s.customers === 1 ? ' cliente debe' : ' clientes deben')" />
        <app-stat-card label="Hasta 30 días" [value]="cop(s.upTo30Days)" icon="pi pi-clock" />
        <app-stat-card label="De 31 a 60 días" [value]="cop(s.from31To60Days)" icon="pi pi-exclamation-circle" />
        <app-stat-card label="Más de 60 días" [value]="cop(s.over60Days)" icon="pi pi-exclamation-triangle"
                       [hint]="s.overLimit > 0 ? s.overLimit + ' pasaron su cupo' : null" />
      </div>
    }

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    searchPlaceholder="Buscar cliente por nombre o documento" caption="Clientes con fiado"
                    emptyIcon="pi pi-book"
                    [emptyTitle]="showAll ? 'Ningún cliente tiene cupo de fiado' : 'Nadie te debe'"
                    emptyMessage="Para fiarle a un cliente, ponle un cupo en Clientes. Después, al cobrar, elige Fiado."
                    (queryChange)="load($event)">
      <label tableToolbar class="flex items-center gap-2 text-sm">
        <input type="checkbox" [ngModel]="showAll" (ngModelChange)="showAll = $event; reloadFirstPage()" />
        Ver también los que están al día
      </label>
      <ng-template appCell="name" let-row>
        <a class="text-brand font-medium hover:underline" [routerLink]="['/app/fiados', row.customerId]">{{ row.name }}</a>
        @if (!row.active) {
          <span class="text-xs text-muted"> (inactivo)</span>
        }
      </ng-template>
      <ng-template appCell="balance" let-row>
        <span class="tabular-nums font-semibold" [class.text-danger]="row.balance > row.creditLimit">
          {{ cop(row.balance) }}
        </span>
      </ng-template>
      <ng-template appCell="age" let-row>
        @switch (severity(row)) {
          @case ('danger') { <span class="text-danger font-medium">{{ age(row) }}</span> }
          @case ('warn') { <span class="text-warning font-medium">{{ age(row) }}</span> }
          @case ('ok') { <span>{{ age(row) }}</span> }
          @default { <span class="text-muted">Al día</span> }
        }
      </ng-template>
      <ng-template #actions let-row>
        @if (row.balance > 0) {
          @if (canCollect()) {
            <p-button label="Abonar" icon="pi pi-dollar" size="small" [text]="true" (onClick)="openPayment(row)" />
          }
          <a pButton [text]="true" size="small" icon="pi pi-whatsapp" label="Recordar" target="_blank"
             rel="noopener noreferrer" [href]="whatsApp(row)"
             [attr.aria-label]="'Recordar a ' + row.name + ' por WhatsApp (abre WhatsApp)'"></a>
        }
      </ng-template>
    </app-data-table>

    <app-credit-payment-dialog [(visible)]="paymentOpen" [account]="paying()" (paid)="paid($event)" />
  `,
})
export class CreditComponent implements OnInit {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  private readonly api = inject(CreditApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly paymentDialog = viewChild(CreditPaymentDialogComponent);
  protected readonly canCollect = permissionFlag('credit:collect');

  protected readonly summary = signal<CreditSummary | null>(null);
  protected readonly page = signal<PageResponse<CreditAccount> | null>(null);
  protected readonly loading = signal(true);
  protected readonly paying = signal<CreditAccount | null>(null);
  protected paymentOpen = false;
  protected showAll = false;
  private query: TableQuery = initialQuery();

  protected readonly cop = formatCop;
  protected readonly trackById = (row: CreditAccount): string => row.customerId;
  protected readonly columns: ColumnDef<CreditAccount>[] = [
    { header: 'Cliente', cell: (a) => a.name, template: 'name' },
    { header: 'Documento', cell: (a) => a.formattedDocument, kind: 'mono', hideOnMobile: true },
    { header: 'Debe', cell: (a) => a.balance, kind: 'money', template: 'balance' },
    { header: 'Cupo', cell: (a) => a.creditLimit, kind: 'money', hideOnMobile: true },
    { header: 'Antigüedad', cell: (a) => debtAgeLabel(a.oldestDebtAt), template: 'age' },
    { header: 'Último abono', cell: (a) => a.lastPaymentAt, kind: 'date', hideOnMobile: true },
  ];

  ngOnInit(): void {
    this.loadSummary();
    this.load(this.query);
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.accounts(toPageQuery(query), query.search, this.showAll ? 'ALL' : 'DEBT').pipe(this.latest.only())
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

  protected severity(account: CreditAccount): string {
    return debtSeverity(account);
  }

  protected age(account: CreditAccount): string {
    return debtAgeLabel(account.oldestDebtAt) ?? '';
  }

  protected whatsApp(account: CreditAccount): string {
    return whatsAppLink(account, this.auth.currentTenant()?.tradeName ?? 'tu tienda');
  }

  openPayment(account: CreditAccount): void {
    this.paying.set(account);
    this.paymentDialog()?.prepare(account);
    this.paymentOpen = true;
  }

  paid(entry: CreditEntry): void {
    this.messages.add({
      severity: 'success',
      summary: 'Abono registrado',
      detail: entry.balanceAfter > 0 ? `Queda debiendo ${formatCop(entry.balanceAfter)}.` : 'Quedó al día.',
      life: 4000,
    });
    this.loadSummary();
    this.load(this.query);
  }

  private loadSummary(): void {
    this.api.summary().subscribe((summary) => this.summary.set(summary));
  }
}
