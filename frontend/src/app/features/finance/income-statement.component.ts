import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Branch } from '../../core/api/api.models';
import { FinanceApi, IncomeStatement, Statement } from '../../core/api/finance.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { AuthService } from '../../core/auth/auth.service';
import { BrandingService } from '../../core/theme/branding.service';
import { saveDownload } from '../../shared/download';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { PeriodFilterComponent } from '../../shared/period-filter.component';
import { printReceipt } from '../../shared/receipt/receipt-prefs';
import { formatDay } from '../orders/order-text';
import { PeriodSelection, periodLabel, resolvePeriod } from '../reports/periods';
import { IncomeStatementDocumentComponent } from './income-statement-document.component';
import { StatementRow, change, changeText, marginText, plainWords, statementRows } from './income-statement-text';

/**
 * Estado de resultados (Finanzas parte C, decisión 323): cuánto vendiste, cuánto te costó, cuánto gastaste y cuánto
 * ganaste, comparado con el periodo anterior y con el año pasado, y explicado en palabras simples.
 */
@Component({
  selector: 'app-income-statement',
  imports: [ButtonModule, PageHeaderComponent, PeriodFilterComponent, IncomeStatementDocumentComponent],
  template: `
    <app-page-header title="Estado de resultados" glyph="income"
                     description="Cuánto ganaste: lo que vendiste, menos lo que te costó, menos tus gastos.">
      <p-button label="Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" [loading]="exporting()"
                [disabled]="!report()" (onClick)="export()" />
      <p-button label="PDF" icon="pi pi-print" [disabled]="!report()" (onClick)="print()" />
    </app-page-header>

    <app-period-filter [selection]="period()" [options]="['thisMonth', 'lastMonth', 'custom']" [branches]="branches()"
                       [showBranch]="branches().length > 1" (selectionChange)="setPeriod($event)" />

    @if (report(); as r) {
      @let c = r.current;
      <section class="grid gap-3 grid-cols-1 sm:grid-cols-3 mt-4" aria-label="Resultado del periodo">
        <article class="card p-4">
          <p class="text-xs text-muted">Vendiste (sin IVA)</p>
          <p class="text-2xl font-extrabold tabular-nums">{{ cop(c.netSales) }}</p>
          <p class="text-xs text-muted">{{ c.salesCount }} {{ c.salesCount === 1 ? 'venta' : 'ventas' }}</p>
        </article>
        <article class="card p-4">
          <p class="text-xs text-muted">Te quedó de vender</p>
          <p class="text-2xl font-extrabold tabular-nums">{{ cop(c.grossProfit) }}</p>
          <p class="text-xs text-muted">{{ c.grossMargin === null ? 'Sin ventas' : margin(c.grossMargin) + ' de lo vendido' }}</p>
        </article>
        <article class="card p-4" [class.bg-success-soft]="c.operatingProfit > 0" [class.bg-danger-soft]="c.operatingProfit < 0">
          <p class="text-xs" [class.text-muted]="c.operatingProfit === 0">{{ c.operatingProfit < 0 ? 'Perdiste' : 'Ganaste' }}</p>
          <p class="text-2xl font-extrabold tabular-nums">{{ cop(abs(c.operatingProfit)) }}</p>
          <p class="text-xs">después de {{ cop(c.expensesTotal) }} de gastos</p>
        </article>
      </section>

      <section class="card p-4 mt-4" aria-labelledby="in-words">
        <h2 id="in-words" class="font-bold tracking-tight mb-2">En palabras</h2>
        <ul class="flex flex-col gap-1 text-sm">
          @for (line of words(); track $index) { <li>{{ line }}</li> }
        </ul>
        @if (r.unpaidRecurring.count > 0) {
          <p class="mt-3 text-sm rounded-lg bg-warning-soft text-warning-soft-fg p-2" role="status">
            Hay {{ r.unpaidRecurring.count }} {{ r.unpaidRecurring.count === 1 ? 'gasto fijo' : 'gastos fijos' }} de
            este periodo sin pagar por {{ cop(r.unpaidRecurring.total) }}. No están restados: cuando los pagues, el
            resultado baja.
          </p>
        }
      </section>

      <section class="card mt-4 overflow-x-auto" aria-label="Estado de resultados">
        <table class="w-full text-sm">
          <caption class="sr-only">Estado de resultados de {{ label() }}</caption>
          <thead class="bg-surface-alt">
            <tr>
              <th class="p-3 text-left">Concepto</th>
              <th class="p-3 text-right">{{ label() }}</th>
              @if (r.previous; as p) {
                <th class="p-3 text-right">Anterior<span class="block text-xs font-normal text-muted">{{ range(p) }}</span></th>
              }
              @if (r.lastYear; as y) {
                <th class="p-3 text-right">Año pasado<span class="block text-xs font-normal text-muted">{{ range(y) }}</span></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.key) {
              <tr class="border-t" [class.font-bold]="row.kind === 'result'" [class.bg-surface-alt]="row.kind === 'result'">
                <td class="p-3" [class.pl-8]="row.kind === 'expense'" [class.text-muted]="row.kind === 'expense'">
                  {{ sign(row) }}{{ row.label }}
                  @if (row.hint) { <span class="block text-xs font-normal text-muted">{{ row.hint }}</span> }
                </td>
                <td class="p-3 text-right tabular-nums whitespace-nowrap"
                    [class.text-danger]="row.kind === 'result' && (row.value(c) ?? 0) < 0">{{ cop(row.value(c)) }}</td>
                @if (r.previous; as p) {
                  <td class="p-3 text-right tabular-nums whitespace-nowrap">{{ cop(row.value(p)) }}
                    <span class="block text-xs font-normal" [class]="toneOf(row, row.value(c), row.value(p))">{{ diff(row.value(c), row.value(p)) }}</span></td>
                }
                @if (r.lastYear; as y) {
                  <td class="p-3 text-right tabular-nums whitespace-nowrap">{{ cop(row.value(y)) }}
                    <span class="block text-xs font-normal" [class]="toneOf(row, row.value(c), row.value(y))">{{ diff(row.value(c), row.value(y)) }}</span></td>
                }
              </tr>
            }
          </tbody>
        </table>
        @if (!r.previous && !r.lastYear) {
          <p class="p-3 text-xs text-muted border-t">Cuando haya datos del periodo anterior o del año pasado, aparecen aquí para comparar.</p>
        }
      </section>

      <section class="card p-4 mt-4 text-sm flex flex-col gap-1" aria-labelledby="apart">
        <h2 id="apart" class="font-bold tracking-tight mb-1">Aparte</h2>
        <p class="flex justify-between gap-2"><span>IVA y otros impuestos que cobraste <span class="text-xs text-muted">(son de la DIAN)</span></span>
          <span class="tabular-nums">{{ cop(c.tax) }}</span></p>
        @if (c.withheld !== null) {
          <p class="flex justify-between gap-2"><span>Retenciones que te hicieron <span class="text-xs text-muted">(las descuentas al declarar)</span></span>
            <span class="tabular-nums">{{ cop(c.withheld) }}</span></p>
        } @else {
          <p class="text-xs text-muted">Las retenciones se ven con "Todas" las sucursales.</p>
        }
        <p class="text-xs text-muted mt-2">Con lo registrado en XASKA: ventas, costo promedio de lo vendido y gastos. No
          reemplaza los estados financieros de tu contador.</p>
      </section>

      <app-income-statement-document class="receipt-print-root" [report]="r" [businessName]="businessName()"
                                     [logo]="logo()" />
    } @else if (error()) {
      <p class="card p-4 mt-4 text-sm text-danger" role="alert">No se pudo cargar el estado de resultados. Intenta de nuevo.</p>
    } @else {
      <p class="card p-4 mt-4 text-sm text-muted">Cargando…</p>
    }
  `,
})
export class IncomeStatementComponent implements OnInit {
  private readonly api = inject(FinanceApi);
  private readonly organization = inject(OrganizationApi);
  private readonly auth = inject(AuthService);
  protected readonly logo = inject(BrandingService).logo;

  protected readonly period = signal<PeriodSelection>({ period: 'thisMonth', from: null, to: null, branchId: null });
  protected readonly branches = signal<Branch[]>([]);
  protected readonly report = signal<IncomeStatement | null>(null);
  protected readonly error = signal(false);
  protected readonly exporting = signal(false);
  protected readonly label = computed(() => periodLabel(this.period(), resolvePeriod(this.period())));
  protected readonly rows = computed(() => {
    const r = this.report();
    return r ? statementRows(r.current, [r.previous, r.lastYear]) : [];
  });
  protected readonly words = computed(() => {
    const r = this.report();
    return r ? plainWords(r.current) : [];
  });
  protected readonly businessName = computed(() => this.auth.currentTenant()?.tradeName ?? '');

  protected readonly cop = formatCop;
  protected readonly margin = marginText;

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100 }).subscribe({
      next: (page) => this.branches.set(page.content.filter((b) => b.active)),
      error: () => this.branches.set([]),
    });
    this.load();
  }

  protected setPeriod(selection: PeriodSelection): void {
    this.period.set(selection);
    this.load();
  }

  private load(): void {
    const range = resolvePeriod(this.period());
    this.error.set(false);
    this.report.set(null);
    this.api.incomeStatement(range.from, range.to, this.period().branchId).subscribe({
      next: (r) => this.report.set(r),
      error: () => this.error.set(true),
    });
  }

  protected export(): void {
    const range = resolvePeriod(this.period());
    this.exporting.set(true);
    this.api.incomeStatementCsv(range.from, range.to, this.period().branchId).subscribe({
      next: (response) => {
        this.exporting.set(false);
        saveDownload(response, 'estado-de-resultados.csv');
      },
      error: () => this.exporting.set(false),
    });
  }

  protected print(): void {
    printReceipt();
  }

  protected range(s: Statement): string {
    return `${formatDay(s.from)} a ${formatDay(s.to)}`;
  }

  protected sign(row: StatementRow): string {
    return row.kind === 'minus' ? '− ' : row.kind === 'result' ? '= ' : '';
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  protected diff(current: number | null, other: number | null): string {
    return changeText(change(current, other));
  }

  /** Subir es bueno en ventas y utilidades, y malo en costos y gastos. */
  protected toneOf(row: StatementRow, current: number | null, other: number | null): string {
    const c = change(current, other);
    if (c === null || c === 0) {
      return 'text-muted';
    }
    const goodWhenUp = row.kind === 'income' || row.kind === 'result';
    return (c > 0) === goodWhenUp ? 'text-success' : 'text-danger';
  }
}
