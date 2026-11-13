import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { Observable } from 'rxjs';
import { Branch, PageResponse } from '../../core/api/api.models';
import {
  Expense,
  ExpenseCategory,
  ExpenseFilters,
  ExpenseSource,
  ExpenseSummary,
  ExpensesApi,
  RecurringDue,
  RecurringDueSummary,
  RecurringExpensesApi,
} from '../../core/api/expenses.api';
import { OrganizationApi } from '../../core/api/organization.api';
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
import { ExpenseCategoriesDialogComponent } from './expense-categories-dialog.component';
import { ExpenseDialogComponent } from './expense-dialog.component';
import { RecurringExpensesDialogComponent } from './recurring-expenses-dialog.component';
import { dueLabel, dueLine, skipLabel } from './recurring-text';
import { ConfirmService } from '../../shared/confirm';
import { categoryShares, expenseBadge, expenseLine, expenseNumber, expenseSource, hasExtraFilters, voidBlocker } from './expense-text';

/**
 * Gastos (Finanzas parte A, decisión 320): en qué se fue la plata del periodo, por categoría, y el listado con filtros.
 * Los gastos en efectivo salen de la caja; los pagados con otro medio no la tocan. Los egresos de caja de antes
 * aparecen "sin clasificar" hasta que se les pone categoría.
 */
@Component({
  selector: 'app-expenses',
  imports: [FormsModule, ButtonComponent, AppInputDirective, PageHeaderComponent, PeriodFilterComponent, StatCardComponent,
    StatusBadgeComponent, DataTableComponent, CellTemplateDirective, FormDialogComponent, ExpenseDialogComponent,
    ExpenseCategoriesDialogComponent, RecurringExpensesDialogComponent],
  template: `
    <app-page-header title="Gastos" glyph="expenses"
                     description="Todo lo que paga el negocio para funcionar: arriendo, servicios, nómina, transporte… En efectivo desde la caja o por banco, Nequi o tarjeta.">
      <app-button label="Gastos fijos" icon="pi pi-replay" severity="secondary" [outlined]="true"
                (clicked)="recurringDialog()?.open()" />
      @if (canManage()) {
        <app-button label="Categorías" icon="pi pi-tags" severity="secondary" [outlined]="true" (clicked)="categoriesDialog()?.open()" />
      }
      <app-button label="Exportar" icon="pi pi-download" severity="secondary" [outlined]="true" [loading]="exporting()"
                (clicked)="export()" />
      @if (canManage()) {
        <app-button label="Registrar gasto" icon="pi pi-plus" (clicked)="dialog()?.openNew()" />
      }
    </app-page-header>

    <app-period-filter [selection]="period()" [options]="['today', 'last7', 'thisMonth', 'lastMonth', 'custom']"
                       [branches]="branches()" [showBranch]="branches().length > 1"
                       (selectionChange)="setPeriod($event)" />

    @if (dues(); as d) {
      @if (d.count > 0 || undo()) {
        <section class="card p-4 mt-4" aria-labelledby="due-title">
          <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h2 id="due-title" class="font-bold tracking-tight">Por pagar
              @if (d.count > 0) { <span class="font-normal text-muted text-sm">· {{ cop(d.total) }}</span> }</h2>
            @if (undo(); as u) {
              <p class="text-sm text-muted">Saltaste {{ dueLineOf(u) }}.
                <button type="button" class="text-brand hover:underline font-medium" (click)="undoSkip(u)">Deshacer</button></p>
            }
          </div>
          <ul class="flex flex-col">
            @for (item of d.items; track item.recurringId + item.dueDate) {
              <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-t border-line first:border-t-0">
                <div class="flex-1 min-w-40">
                  <p class="font-medium">{{ item.name }}</p>
                  <p class="text-xs" [class.text-danger]="item.overdue" [class.font-semibold]="item.overdue"
                     [class.text-muted]="!item.overdue">{{ dueText(item) }} · {{ item.paymentMethodName }}</p>
                </div>
                <span class="font-semibold tabular-nums">{{ cop(item.amount) }}</span>
                @if (canManage()) {
                  <div class="flex gap-1">
                    <app-button label="Pagar" size="small" icon="pi pi-check" (clicked)="dialog()?.openRecurring(item)" />
                    <app-button [label]="skipText(item.frequency)" size="small" [text]="true" severity="secondary"
                              (clicked)="askSkip(item)" />
                  </div>
                }
              </li>
            }
          </ul>
        </section>
      }
    }

    @if (summary(); as s) {
      <section class="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-4" aria-label="Totales del periodo">
        <app-stat-card label="Gastaste" [value]="cop(s.total)" icon="pi pi-arrow-up-right"
                       [hint]="s.count === 1 ? '1 gasto' : s.count + ' gastos'" />
        <app-stat-card label="Salió de la caja" [value]="cop(s.cashTotal)" icon="pi pi-wallet" hint="En efectivo" />
        <app-stat-card label="Fuera de la caja" [value]="cop(s.otherTotal)" icon="pi pi-credit-card"
                       hint="Banco, Nequi, tarjeta…" />
        <button type="button" class="text-left rounded-2xl" [disabled]="s.unclassifiedCount === 0"
                (click)="showUnclassified()"
                [attr.aria-label]="'Ver los ' + s.unclassifiedCount + ' egresos sin clasificar'">
          <app-stat-card label="Sin clasificar" [value]="cop(s.unclassifiedTotal)" icon="pi pi-question-circle"
                         [hint]="s.unclassifiedCount === 0 ? 'Todo tiene categoría' : s.unclassifiedCount + ' por clasificar: toca para verlos'" />
        </button>
      </section>

      @if (shares().length > 0) {
        <section class="card p-4 mt-4" aria-labelledby="by-category">
          <h2 id="by-category" class="font-bold tracking-tight mb-1">En qué se fue la plata</h2>
          <p class="text-xs text-muted mb-3">{{ label() }}. Toca una categoría para ver solo sus gastos.</p>
          <ul class="flex flex-col gap-2">
            @for (c of shares(); track c.categoryId ?? 'none') {
              <li>
                <button type="button" class="w-full text-left rounded-lg px-2 py-1.5 hover:bg-surface-alt"
                        [class.bg-brand-soft]="isCategoryActive(c.categoryId)" (click)="filterCategory(c.categoryId)">
                  <span class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="font-medium truncate">{{ c.name }}</span>
                    <span class="tabular-nums whitespace-nowrap"><strong>{{ cop(c.total) }}</strong>
                      <span class="text-muted"> · {{ c.share }} %</span></span>
                  </span>
                  <span class="block h-2 mt-1 rounded-full bg-surface-alt overflow-hidden" aria-hidden="true">
                    <span class="block h-full rounded-full" [class.bg-brand]="c.categoryId !== null"
                          [class.bg-warning]="c.categoryId === null" [style.width.%]="c.bar"></span>
                  </span>
                </button>
              </li>
            }
          </ul>
        </section>
      }
    }

    <section class="card p-3 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 text-sm" aria-label="Filtros del listado">
      <label class="flex items-center gap-2">
        <span class="text-muted">Categoría</span>
        <select class="border rounded-md px-2 py-1.5" [ngModel]="categoryFilter()" (ngModelChange)="setCategory($event)">
          <option value="">Todas</option>
          @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          <option value="none">Sin clasificar</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <span class="text-muted">Salió de</span>
        <select class="border rounded-md px-2 py-1.5" [ngModel]="source() ?? ''" (ngModelChange)="setSource($event)">
          <option value="">Todo</option>
          <option value="CASH">La caja (efectivo)</option>
          <option value="OTHER">Fuera de la caja</option>
        </select>
      </label>
      <label class="flex items-center gap-2 flex-1 min-w-48">
        <span class="sr-only">Buscar en la nota o la referencia</span>
        <input appInput class="w-full" placeholder="Buscar en la nota o la referencia" [ngModel]="text()"
               (ngModelChange)="setText($event)" />
      </label>
      <label class="flex items-center gap-2 min-h-9 cursor-pointer">
        <input type="checkbox" [ngModel]="includeVoided()" (ngModelChange)="setVoided($event)" />
        Ver anulados
      </label>
      @if (extraFilters()) {
        <app-button label="Quitar filtros" size="small" [text]="true" icon="pi pi-filter-slash" (clicked)="clearFilters()" />
      }
    </section>

    <div class="mt-4">
      <app-data-table [columns]="columns" [page]="page()" [loading]="loading()" [trackBy]="trackById" caption="Gastos"
                      emptyIcon="pi pi-receipt" [emptyTitle]="extraFilters() ? 'Ningún gasto con esos filtros' : 'Sin gastos en este periodo'"
                      emptyMessage="Registra aquí lo que pagas por banco, Nequi o tarjeta. Lo que sale en efectivo se registra en Mi caja con el botón Egreso."
                      [emptyActionLabel]="canManage() && !extraFilters() ? 'Registrar gasto' : null"
                      (emptyAction)="dialog()?.openNew()" (queryChange)="load($event)">
        <ng-template appCell="category" let-row>
          <span class="font-medium" [class.line-through]="row.status === 'VOID'">{{ row.categoryName }}</span>
          @if (row.note) { <span class="block text-xs text-muted">{{ row.note }}</span> }
          @if (row.supplierName) { <span class="block text-xs text-muted">{{ row.supplierName }}</span> }
          @if (row.status === 'VOID' && row.voidReason) {
            <span class="block text-xs text-danger">Anulado: {{ row.voidReason }}</span>
          }
        </ng-template>
        <ng-template appCell="source" let-row>
          <span>{{ sourceOf(row) }}</span>
          @if (row.reference) { <span class="block text-xs text-muted">Ref. {{ row.reference }}</span> }
        </ng-template>
        <ng-template appCell="amount" let-row>
          <span class="font-semibold tabular-nums" [class.line-through]="row.status === 'VOID'">{{ cop(row.amount) }}</span>
        </ng-template>
        <ng-template appCell="status" let-row>
          <app-status-badge [status]="badge(row).key" [label]="badge(row).label" />
        </ng-template>
        <ng-template #actions let-row>
          @if (row.hasDocument) {
            <app-button icon="pi pi-paperclip" size="small" [text]="true" label="Soporte" (clicked)="download(row)" />
          }
          @if (canManage() && row.status === 'ACTIVE') {
            @if (row.unclassified) {
              <app-button icon="pi pi-tag" size="small" [text]="true" label="Clasificar" (clicked)="dialog()?.openClassify(row)" />
            } @else {
              <app-button icon="pi pi-pencil" size="small" [text]="true" label="Corregir" (clicked)="dialog()?.openEdit(row)" />
              <app-button icon="pi pi-ban" size="small" [text]="true" severity="danger" label="Anular" (clicked)="askVoid(row)" />
            }
          }
        </ng-template>
      </app-data-table>
    </div>

    <app-expense-dialog (saved)="onSaved($event)" />
    <app-expense-categories-dialog (changed)="reload()" />
    <app-recurring-expenses-dialog (changed)="loadDues()" />

    @if (voiding(); as v) {
      <app-form-dialog [(visible)]="voidOpen" header="Anular gasto" width="28rem" submitLabel="Anular gasto"
                       submitIcon="pi pi-ban" [destructive]="true" [dirty]="voidReason.trim().length > 0"
                       [invalidMessage]="voidProblem()" [save]="voidRequest" [successMessage]="null"
                       (saved)="onVoided()">
        <p class="text-sm">{{ line(v) }}</p>
        @if (blocker(v); as why) {
          <p class="text-sm text-danger" role="alert">No se puede anular. {{ why }}
            @if (v.fromCash) { Si la plata volvió, regístrala como un ingreso en la caja de hoy. }</p>
        } @else {
          @if (v.fromCash) {
            <p class="text-sm text-muted">El efectivo vuelve a la caja de donde salió, que sigue abierta.</p>
          }
          <label class="flex flex-col gap-1">
            <span class="text-sm font-medium">¿Por qué lo anulas?</span>
            <input appInput name="voidReason" maxlength="255" [(ngModel)]="voidReason"
                   placeholder="Ej.: se registró dos veces" />
          </label>
        }
      </app-form-dialog>
    }
  `,
})
export class ExpensesComponent implements OnInit {
  private readonly latest = new LatestRequest();
  private readonly latestSummary = new LatestRequest();
  private readonly api = inject(ExpensesApi);
  private readonly organization = inject(OrganizationApi);
  private readonly messages = inject(MessageService);
  private readonly recurring = inject(RecurringExpensesApi);
  private readonly confirm = inject(ConfirmService);
  protected readonly recurringDialog = viewChild(RecurringExpensesDialogComponent);
  protected readonly dues = signal<RecurringDueSummary | null>(null);
  /** Lo último que se saltó, para deshacerlo sin salir de la pantalla. */
  protected readonly undo = signal<RecurringDue | null>(null);
  protected readonly dueText = dueLabel;
  protected readonly skipText = skipLabel;
  protected readonly canManage = permissionFlag('expenses:manage');
  protected readonly dialog = viewChild(ExpenseDialogComponent);
  protected readonly categoriesDialog = viewChild(ExpenseCategoriesDialogComponent);

  protected readonly period = signal<PeriodSelection>({ period: 'thisMonth', from: null, to: null, branchId: null });
  protected readonly categoryFilter = signal('');
  protected readonly source = signal<ExpenseSource | null>(null);
  protected readonly text = signal('');
  protected readonly includeVoided = signal(false);
  protected readonly filters = computed<ExpenseFilters>(() => {
    const range = resolvePeriod(this.period());
    const category = this.categoryFilter();
    return {
      from: range.from, to: range.to, branchId: this.period().branchId,
      categoryId: category && category !== 'none' ? category : null, unclassified: category === 'none',
      source: this.source(), includeVoided: this.includeVoided(), text: this.text().trim() || null,
    };
  });
  protected readonly extraFilters = computed(() => hasExtraFilters({ ...this.filters(), branchId: null }));
  protected readonly label = computed(() => periodLabel(this.period(), resolvePeriod(this.period())));

  protected readonly page = signal<PageResponse<Expense> | null>(null);
  protected readonly summary = signal<ExpenseSummary | null>(null);
  protected readonly shares = computed(() => {
    const s = this.summary();
    return s ? categoryShares(s) : [];
  });
  protected readonly categories = signal<ExpenseCategory[]>([]);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly loading = signal(true);
  protected readonly exporting = signal(false);
  private query: TableQuery = initialQuery();
  private textTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly voiding = signal<Expense | null>(null);
  protected voidOpen = false;
  protected voidReason = '';

  protected readonly cop = formatCop;
  protected readonly badge = expenseBadge;
  protected readonly sourceOf = expenseSource;
  protected readonly line = expenseLine;
  protected readonly blocker = voidBlocker;
  protected readonly trackById = (row: Expense): string => row.id;
  protected readonly columns: ColumnDef<Expense>[] = [
    { header: 'Fecha', cell: (e) => formatDay(e.date), cellClass: 'whitespace-nowrap' },
    { header: 'Gasto', cell: (e) => e.categoryName, template: 'category' },
    { header: 'Valor', cell: (e) => e.amount, kind: 'money', template: 'amount' },
    { header: 'Pagado con', cell: (e) => expenseSource(e), template: 'source' },
    { header: 'Sede', cell: (e) => e.branchName, hideOnMobile: true },
    { header: 'Número', cell: (e) => expenseNumber(e), hideOnMobile: true, cellClass: 'text-muted whitespace-nowrap' },
    { header: 'Registró', cell: (e) => e.createdByName, hideOnMobile: true },
    { header: 'Estado', cell: (e) => e.status, template: 'status' },
  ];

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100 }).subscribe({
      next: (page) => this.branches.set(page.content.filter((b) => b.active)),
      error: () => this.branches.set([]),
    });
    this.loadCategories();
    this.loadSummary();
    this.loadDues();
    this.load(this.query);
  }

  protected loadDues(): void {
    this.recurring.due().subscribe({ next: (d) => this.dues.set(d), error: () => this.dues.set(null) });
  }

  protected dueLineOf(due: RecurringDue): string {
    return dueLine(due);
  }

  protected askSkip(due: RecurringDue): void {
    this.confirm.ask({
      header: skipLabel(due.frequency),
      message: `${dueLine(due)} deja de estar por pagar y no se registra ningún gasto.`,
      acceptLabel: 'No se paga',
      accept: () => this.recurring.skip(due.recurringId, due.dueDate).subscribe(() => {
        this.undo.set(due);
        this.loadDues();
      }),
    });
  }

  protected undoSkip(due: RecurringDue): void {
    this.recurring.unskip(due.recurringId, due.dueDate).subscribe(() => {
      this.undo.set(null);
      this.loadDues();
    });
  }

  /** La primera página se pide al entrar; la tabla avisa cuando se cambia de página. */
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

  /** Vuelve a pedir totales y listado (desde la primera página). */
  protected reload(): void {
    this.loadCategories();
    this.loadSummary();
    this.load({ ...this.query, page: 0 });
  }

  private loadSummary(): void {
    // Los totales no dependen de "Ver anulados": un anulado nunca suma.
    this.api.summary(this.filters()).pipe(this.latestSummary.only()).subscribe((s) => this.summary.set(s));
  }

  private loadCategories(): void {
    this.api.categories(true).subscribe((list) => this.categories.set(list));
  }

  protected setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.refresh();
  }

  protected setCategory(value: string): void {
    this.categoryFilter.set(value);
    this.refresh();
  }

  protected setSource(value: string): void {
    this.source.set(value === 'CASH' || value === 'OTHER' ? value : null);
    this.refresh();
  }

  protected setVoided(value: boolean): void {
    this.includeVoided.set(value);
    this.load({ ...this.query, page: 0 });
  }

  /** Espera a que se deje de escribir para no pedir en cada letra. */
  protected setText(value: string): void {
    this.text.set(value);
    if (this.textTimer) {
      clearTimeout(this.textTimer);
    }
    this.textTimer = setTimeout(() => this.refresh(), 350);
  }

  protected showUnclassified(): void {
    this.setCategory('none');
  }

  protected isCategoryActive(categoryId: string | null): boolean {
    return this.categoryFilter() === (categoryId ?? 'none');
  }

  /** Tocar la categoría ya elegida quita el filtro. */
  protected filterCategory(categoryId: string | null): void {
    this.setCategory(this.isCategoryActive(categoryId) ? '' : categoryId ?? 'none');
  }

  protected clearFilters(): void {
    this.categoryFilter.set('');
    this.source.set(null);
    this.text.set('');
    this.includeVoided.set(false);
    this.refresh();
  }

  private refresh(): void {
    this.loadSummary();
    this.load({ ...this.query, page: 0 });
  }

  protected onSaved(expense: Expense): void {
    this.messages.add({ severity: 'success', summary: 'Gasto guardado', detail: expenseLine(expense), life: 3000 });
    this.loadDues();
    this.refresh();
  }

  protected export(): void {
    this.exporting.set(true);
    this.api.csv(this.filters()).subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, 'gastos.csv');
      },
      error: () => this.exporting.set(false),
    });
  }

  protected download(expense: Expense): void {
    this.api.document(expense.id).subscribe((response) => saveDownload(response, 'soporte-gasto'));
  }

  protected askVoid(expense: Expense): void {
    this.voiding.set(expense);
    this.voidReason = '';
    this.voidOpen = true;
  }

  protected voidProblem(): string | null {
    const expense = this.voiding();
    if (!expense) {
      return null;
    }
    return voidBlocker(expense) ?? (this.voidReason.trim() ? null : 'Escribe por qué lo anulas.');
  }

  protected readonly voidRequest = (): Observable<Expense> =>
    this.api.void(this.voiding()!.id, this.voidReason.trim());

  protected onVoided(): void {
    this.messages.add({ severity: 'success', summary: 'Gasto anulado', life: 3000 });
    // Si era el pago de un gasto fijo, esa fecha vuelve a quedar por pagar.
    this.loadDues();
    this.refresh();
  }
}
