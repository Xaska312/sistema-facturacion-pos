import { Component, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, tap } from 'rxjs';
import { CreditAccount, CreditEntry, PageResponse } from '../../core/api/api.models';
import { CreditApi } from '../../core/api/credit.api';
import { AuthService } from '../../core/auth/auth.service';
import { permissionFlag } from '../../core/auth/permission-flag';
import { documentShortLabel } from '../../shared/document-types';
import { formatDate } from '../../shared/format';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { LatestRequest } from '../../shared/latest-request';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { StatCardComponent } from '../../shared/stat-card.component';
import { CellTemplateDirective } from '../../shared/table/cell-template.directive';
import { DataTableComponent } from '../../shared/table/data-table.component';
import { ColumnDef, TableQuery, initialQuery, toPageQuery } from '../../shared/table/table';
import { CreditPaymentDialogComponent } from './credit-payment-dialog.component';
import { ENTRY_LABEL, balanceLabel, debtAgeLabel, entryDetail, whatsAppLink } from './credit-text';

/** Cuenta de fiado de un cliente: saldo, cupo, estado de cuenta, abonos y su anulación (decisión 255). */
@Component({
  selector: 'app-credit-account',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PageHeaderComponent, StatCardComponent,
    DataTableComponent, CellTemplateDirective, CreditPaymentDialogComponent, FormDialogComponent],
  template: `
    <app-page-header [title]="account()?.name ?? 'Fiado del cliente'" [description]="subtitle()">
      <a pButton routerLink="/app/fiados" label="Todos los fiados" icon="pi pi-arrow-left" severity="secondary"
         [outlined]="true"></a>
    </app-page-header>

    @if (account(); as a) {
      <div class="grid gap-3 grid-cols-1 sm:grid-cols-3 mb-4">
        <app-stat-card label="Saldo" [value]="cop(a.balance)" icon="pi pi-book"
                       [hint]="age(a) ?? balanceText(a.balance)" />
        <app-stat-card label="Cupo de fiado" [value]="cop(a.creditLimit)" icon="pi pi-wallet"
                       [hint]="a.balance > a.creditLimit ? 'Pasó el cupo' : 'Disponible ' + cop(a.available)" />
        <app-stat-card label="Último abono" [value]="a.lastPaymentAmount === null ? '—' : cop(a.lastPaymentAmount)"
                       icon="pi pi-dollar" [hint]="a.lastPaymentAt ? 'El ' + date(a.lastPaymentAt) : 'Aún no ha abonado'" />
      </div>
      <div class="flex flex-wrap gap-2 mb-4">
        @if (canCollect() && a.balance > 0) {
          <p-button label="Recibir abono" icon="pi pi-dollar" (onClick)="openPayment()" />
        }
        @if (a.balance > 0) {
          <a pButton label="Recordar por WhatsApp" icon="pi pi-whatsapp" severity="secondary" [outlined]="true"
             target="_blank" rel="noopener noreferrer" [href]="whatsApp(a)"></a>
        }
        @if (a.creditLimit <= 0) {
          <p class="text-sm text-muted self-center">
            No tiene cupo de fiado: el dueño o un administrador se lo asigna en
            <a class="text-brand hover:underline" routerLink="/app/clientes">Clientes</a>.
          </p>
        }
      </div>
    }

    <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById"
                    [pageSizeOptions]="[20, 50, 100]" caption="Estado de cuenta, del movimiento más reciente al más antiguo"
                    emptyIcon="pi pi-book" emptyTitle="Sin movimientos"
                    emptyMessage="Aquí aparecen las ventas fiadas y los abonos de este cliente."
                    (queryChange)="load($event)">
      <ng-template appCell="movement" let-row>
        <span class="font-medium">{{ entryLabel(row) }}</span>
        @if (row.voided) {
          <span class="ml-1 text-xs rounded px-1.5 py-0.5 bg-danger-soft text-danger-soft-fg">Anulado</span>
        }
        <span class="block text-xs text-muted">{{ detail(row) }}</span>
        @if (row.voided && row.voidReason) {
          <span class="block text-xs text-muted">Anulado: {{ row.voidReason }}</span>
        }
      </ng-template>
      <ng-template appCell="amount" let-row>
        <span class="tabular-nums" [class.text-success]="row.amount < 0" [class.line-through]="row.voided">
          {{ row.amount < 0 ? '−' : '+' }}{{ cop(abs(row.amount)) }}
        </span>
      </ng-template>
      <ng-template #actions let-row>
        @if (canManage() && row.type === 'PAYMENT' && !row.voided) {
          <p-button label="Anular" icon="pi pi-ban" size="small" severity="danger" [text]="true" (onClick)="openVoid(row)" />
        }
      </ng-template>
    </app-data-table>

    <app-credit-payment-dialog [(visible)]="paymentOpen" [account]="account()" (paid)="paid($event)" />

    <app-form-dialog [(visible)]="voidOpen" header="Anular abono" width="26rem" submitLabel="Anular abono"
                     submitIcon="pi pi-ban" [destructive]="true" [dirty]="voidReason.trim().length > 0"
                     [invalidMessage]="voidReason.trim() ? null : 'Escribe el motivo de la anulación.'"
                     [save]="voidRequest" [successMessage]="null" (saved)="refresh()"
                     description="La deuda vuelve a subir. Si fue en efectivo, el dinero sale de la caja.">
      <div class="flex flex-col gap-1">
        <label for="void-reason" class="text-sm font-medium">Motivo</label>
        <input pInputText id="void-reason" maxlength="200" [(ngModel)]="voidReason" placeholder="Se registró dos veces" />
      </div>
    </app-form-dialog>
  `,
})
export class CreditAccountComponent {
  /** Cancela la petición anterior de la lista (QA UI-10). */
  private readonly latest = new LatestRequest();
  /** Parámetro de ruta :customerId. */
  readonly customerId = input.required<string>();

  private readonly api = inject(CreditApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly paymentDialog = viewChild(CreditPaymentDialogComponent);
  protected readonly canCollect = permissionFlag('credit:collect');
  protected readonly canManage = permissionFlag('credit:manage');

  protected readonly account = signal<CreditAccount | null>(null);
  protected readonly page = signal<PageResponse<CreditEntry> | null>(null);
  protected readonly loading = signal(true);
  protected paymentOpen = false;
  protected voidOpen = false;
  protected voidReason = '';
  private voiding: CreditEntry | null = null;
  private query: TableQuery = initialQuery();

  protected readonly cop = formatCop;
  protected readonly abs = Math.abs;
  protected readonly date = formatDate;
  protected readonly balanceText = balanceLabel;
  protected readonly trackById = (row: CreditEntry): string => row.id;
  protected readonly columns: ColumnDef<CreditEntry>[] = [
    { header: 'Fecha', cell: (e) => e.createdAt, kind: 'datetime' },
    { header: 'Movimiento', cell: (e) => ENTRY_LABEL[e.type], template: 'movement' },
    { header: 'Valor', cell: (e) => e.amount, kind: 'money', template: 'amount' },
    { header: 'Saldo', cell: (e) => e.balanceAfter, kind: 'money' },
    { header: 'Registró', cell: (e) => e.createdByName, hideOnMobile: true },
  ];

  constructor() {
    // Al pasar de un cliente a otro en la misma pantalla se recarga todo.
    effect(() => {
      this.customerId();
      untracked(() => {
        this.account.set(null);
        this.query = initialQuery();
        this.refresh();
      });
    });
  }

  protected subtitle(): string | null {
    const a = this.account();
    return a ? `${documentShortLabel(a.documentType)} ${a.formattedDocument}${a.phone ? ' · ' + a.phone : ''}` : null;
  }

  load(query: TableQuery): void {
    this.query = query;
    this.loading.set(true);
    this.api.entries(this.customerId(), toPageQuery(query)).pipe(this.latest.only()).subscribe({
      next: (result) => {
        this.page.set(result);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  refresh(): void {
    this.loadAccount();
    this.load(this.query);
  }

  protected age(account: CreditAccount): string | null {
    return account.balance > 0 ? debtAgeLabel(account.oldestDebtAt) : null;
  }

  protected entryLabel(entry: CreditEntry): string {
    return ENTRY_LABEL[entry.type];
  }

  protected detail(entry: CreditEntry): string {
    return entryDetail(entry);
  }

  protected whatsApp(account: CreditAccount): string {
    return whatsAppLink(account, this.auth.currentTenant()?.tradeName ?? 'tu tienda');
  }

  openPayment(): void {
    const account = this.account();
    if (!account) {
      return;
    }
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
    this.refresh();
  }

  openVoid(entry: CreditEntry): void {
    this.voiding = entry;
    this.voidReason = '';
    this.voidOpen = true;
  }

  protected readonly voidRequest = (): Observable<CreditEntry> =>
    this.api.voidPayment(this.voiding!.id, this.voidReason.trim()).pipe(
      tap(() => this.messages.add({ severity: 'success', summary: 'Abono anulado', life: 3000 })),
    );

  private loadAccount(): void {
    const id = this.customerId();
    this.api.account(id).subscribe({
      next: (account) => {
        if (this.customerId() === id) {
          this.account.set(account);
        }
      },
      // El 404 (no es cliente) ya lo avisa el manejo global de errores; la pantalla queda sin datos.
      error: () => this.loading.set(false),
    });
  }
}
