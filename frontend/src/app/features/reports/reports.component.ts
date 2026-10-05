import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import {
  Branch,
  CategoryReportRow,
  InventoryValuation,
  PaymentReportRow,
  ProductReportRow,
  ReportSummary,
  SalesReportRow,
  TaxReportRow,
} from '../../core/api/api.models';
import { OrganizationApi } from '../../core/api/organization.api';
import { CsvReport, ReportFilters, ReportsApi } from '../../core/api/reports.api';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { BarItem } from '../../shared/charts/bar-scale';
import { saveDownload } from '../../shared/download';
import { formatCop, formatPercent, formatQuantity } from '../../shared/money';
import { QuickRange, daysBetween, quickRange } from './periods';

type Tab = 'summary' | 'days' | 'branches' | 'sellers' | 'payments' | 'products' | 'categories' | 'taxes' | 'inventory';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'days', label: 'Por día' },
  { id: 'branches', label: 'Sucursales' },
  { id: 'sellers', label: 'Vendedores' },
  { id: 'payments', label: 'Medios de pago' },
  { id: 'products', label: 'Productos' },
  { id: 'categories', label: 'Categorías' },
  { id: 'taxes', label: 'Impuestos' },
  { id: 'inventory', label: 'Inventario' },
];

const TAX_NAMES: Record<string, string> = {
  IVA: 'IVA',
  INC: 'Impuesto al consumo',
  EXEMPT: 'Exento',
  EXCLUDED: 'Excluido',
};

/** Reportes de ventas, utilidad, impuestos e inventario con exportación a CSV (permiso reports:read). */
@Component({
  selector: 'app-reports',
  imports: [FormsModule, NgTemplateOutlet, ButtonModule, BarChartComponent],
  template: `
    <h1 class="text-2xl font-semibold mb-4">Reportes</h1>

    <section class="bg-white rounded-xl shadow p-3 mb-4 flex flex-wrap items-end gap-3">
      @if (tab() !== 'inventory') {
        <label class="flex flex-col text-sm">
          <span>Desde</span>
          <input type="date" class="border rounded px-2 py-2" [(ngModel)]="from" (ngModelChange)="reload()" />
        </label>
        <label class="flex flex-col text-sm">
          <span>Hasta</span>
          <input type="date" class="border rounded px-2 py-2" [(ngModel)]="to" (ngModelChange)="reload()" />
        </label>
        <div class="flex flex-wrap gap-1">
          @for (q of quick; track q.id) {
            <p-button [label]="q.label" size="small" [text]="true" (onClick)="setRange(q.id)" />
          }
        </div>
      }
      <label class="flex flex-col text-sm">
        <span>Sucursal</span>
        <select class="border rounded px-2 py-2" [(ngModel)]="branchId" (ngModelChange)="reload()">
          <option [ngValue]="null">Todas</option>
          @for (b of branches(); track b.id) {
            <option [ngValue]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
      @if (tab() !== 'inventory') {
        <label class="flex flex-col text-sm">
          <span>Vendedor</span>
          <select class="border rounded px-2 py-2" [(ngModel)]="sellerId" (ngModelChange)="reload()">
            <option [ngValue]="null">Todos</option>
            @for (s of sellers(); track s.key) {
              <option [ngValue]="s.key">{{ s.label }}</option>
            }
          </select>
        </label>
      }
    </section>

    <nav class="flex flex-wrap gap-1 mb-4" aria-label="Reportes">
      @for (t of tabs; track t.id) {
        <button type="button" class="px-3 py-2 rounded-lg text-sm border"
                [class.bg-slate-900]="tab() === t.id" [class.text-white]="tab() === t.id"
                [class.bg-white]="tab() !== t.id" (click)="select(t.id)">{{ t.label }}</button>
      }
    </nav>

    @if (loading()) {
      <p class="text-slate-500">Cargando…</p>
    }

    @switch (tab()) {
      @case ('summary') {
        @if (summary(); as s) {
          <div class="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Ventas</p>
              <p class="text-2xl font-semibold">{{ cop(s.total) }}</p>
              <p class="text-xs text-slate-500">{{ s.salesCount }} ventas</p>
            </div>
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Ticket promedio</p>
              <p class="text-2xl font-semibold">{{ cop(s.averageTicket) }}</p>
            </div>
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Utilidad</p>
              <p class="text-2xl font-semibold">{{ cop(s.profit) }}</p>
              <p class="text-xs text-slate-500">Margen {{ pct(s.marginPercent) }}</p>
            </div>
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Anuladas</p>
              <p class="text-2xl font-semibold">{{ s.voidedCount }}</p>
              <p class="text-xs text-slate-500">{{ cop(s.voidedTotal) }}</p>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow p-4 text-sm max-w-xl">
            <p class="flex justify-between"><span>Ventas brutas</span><span>{{ cop(s.grossTotal) }}</span></p>
            <p class="flex justify-between"><span>Descuentos</span><span>-{{ cop(s.discountTotal) }}</span></p>
            <p class="flex justify-between"><span>Base (sin impuestos)</span><span>{{ cop(s.subtotal) }}</span></p>
            <p class="flex justify-between"><span>Impuestos</span><span>{{ cop(s.taxTotal) }}</span></p>
            <p class="flex justify-between font-medium border-t mt-1 pt-1"><span>Total vendido</span><span>{{ cop(s.total) }}</span></p>
            <p class="flex justify-between mt-2"><span>Costo de lo vendido</span><span>{{ cop(s.cost) }}</span></p>
            <p class="flex justify-between font-medium"><span>Utilidad (base − costo)</span><span>{{ cop(s.profit) }}</span></p>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <p-button label="Exportar ventas una a una (CSV)" severity="secondary" [outlined]="true"
                      (onClick)="download('sales')" />
          </div>
        }
      }
      @case ('days') {
        <section class="bg-white rounded-xl shadow p-4 mb-4">
          <app-bar-chart orientation="vertical" [items]="dayBars()" [format]="cop" [height]="180"
                         [labelEvery]="dayBars().length > 14 ? 7 : 1" ariaLabel="Ventas por día" />
        </section>
        <ng-container *ngTemplateOutlet="salesTable; context: { $implicit: days(), title: 'Fecha', csv: 'sales/by-day' }" />
      }
      @case ('branches') {
        <section class="bg-white rounded-xl shadow p-4 mb-4">
          <app-bar-chart [items]="bars(branchRows())" [format]="cop" ariaLabel="Ventas por sucursal" />
        </section>
        <ng-container *ngTemplateOutlet="salesTable; context: { $implicit: branchRows(), title: 'Sucursal', csv: 'sales/by-branch' }" />
      }
      @case ('sellers') {
        <section class="bg-white rounded-xl shadow p-4 mb-4">
          <app-bar-chart [items]="bars(sellerRows())" [format]="cop" ariaLabel="Ventas por vendedor" />
        </section>
        <ng-container *ngTemplateOutlet="salesTable; context: { $implicit: sellerRows(), title: 'Vendedor', csv: 'sales/by-seller' }" />
      }
      @case ('payments') {
        <section class="bg-white rounded-xl shadow p-4 mb-4 max-w-2xl">
          <app-bar-chart [items]="paymentBars()" [format]="cop" ariaLabel="Ventas por medio de pago" />
        </section>
        <p-button label="Exportar CSV" severity="secondary" [outlined]="true" (onClick)="download('sales/by-payment-method')" />
      }
      @case ('products') {
        <div class="flex flex-wrap items-center gap-3 mb-3">
          <label class="text-sm">Ordenar por
            <select class="border rounded px-2 py-1 ml-1" [(ngModel)]="productOrder" (ngModelChange)="reload()">
              <option value="total">Valor vendido</option>
              <option value="quantity">Cantidad</option>
            </select>
          </label>
          <p-button label="Exportar CSV" severity="secondary" [outlined]="true" size="small"
                    (onClick)="download('products', { orderBy: productOrder, limit: 1000 })" />
        </div>
        <div class="bg-white rounded-xl shadow overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
              <tr>
                <th class="p-2">Producto</th><th class="p-2">Categoría</th><th class="p-2 text-right">Cantidad</th>
                <th class="p-2 text-right">Total</th><th class="p-2 text-right">Costo</th>
                <th class="p-2 text-right">Utilidad</th><th class="p-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              @for (p of products(); track p.productId) {
                <tr class="border-t">
                  <td class="p-2"><span class="font-mono text-xs text-slate-500">{{ p.sku }}</span> {{ p.name }}</td>
                  <td class="p-2">{{ p.categoryName ?? '—' }}</td>
                  <td class="p-2 text-right whitespace-nowrap">{{ q(p.quantity) }} {{ p.unitCode }}</td>
                  <td class="p-2 text-right">{{ cop(p.total) }}</td>
                  <td class="p-2 text-right">{{ cop(p.cost) }}</td>
                  <td class="p-2 text-right" [class.text-red-700]="p.profit < 0">{{ cop(p.profit) }}</td>
                  <td class="p-2 text-right">{{ pct(p.marginPercent) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="p-6 text-center text-slate-500">Sin ventas en el periodo.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
      @case ('categories') {
        <section class="bg-white rounded-xl shadow p-4 mb-4 max-w-2xl">
          <app-bar-chart [items]="categoryBars()" [format]="cop" ariaLabel="Ventas por categoría" />
        </section>
        <div class="bg-white rounded-xl shadow overflow-x-auto mb-3">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
              <tr>
                <th class="p-2">Categoría</th><th class="p-2 text-right">Base</th><th class="p-2 text-right">Total</th>
                <th class="p-2 text-right">Costo</th><th class="p-2 text-right">Utilidad</th><th class="p-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              @for (c of categories(); track c.categoryId ?? c.categoryName) {
                <tr class="border-t">
                  <td class="p-2">{{ c.categoryName }}</td>
                  <td class="p-2 text-right">{{ cop(c.subtotal) }}</td>
                  <td class="p-2 text-right">{{ cop(c.total) }}</td>
                  <td class="p-2 text-right">{{ cop(c.cost) }}</td>
                  <td class="p-2 text-right">{{ cop(c.profit) }}</td>
                  <td class="p-2 text-right">{{ pct(c.marginPercent) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="p-6 text-center text-slate-500">Sin ventas en el periodo.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p-button label="Exportar CSV" severity="secondary" [outlined]="true" (onClick)="download('categories')" />
      }
      @case ('taxes') {
        <div class="bg-white rounded-xl shadow overflow-x-auto mb-3 max-w-3xl">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left">
              <tr>
                <th class="p-2">Impuesto</th><th class="p-2 text-right">Tarifa</th><th class="p-2 text-right">Ventas</th>
                <th class="p-2 text-right">Base</th><th class="p-2 text-right">Impuesto</th>
              </tr>
            </thead>
            <tbody>
              @for (t of taxes(); track t.taxType + t.taxRate) {
                <tr class="border-t">
                  <td class="p-2">{{ taxName(t.taxType) }}</td>
                  <td class="p-2 text-right">{{ pct(t.taxRate) }}</td>
                  <td class="p-2 text-right">{{ t.salesCount }}</td>
                  <td class="p-2 text-right">{{ cop(t.taxableBase) }}</td>
                  <td class="p-2 text-right">{{ cop(t.taxAmount) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="p-6 text-center text-slate-500">Sin ventas en el periodo.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-xs text-slate-500 mb-3">Base e impuesto de las ventas registradas (no incluye las anuladas).</p>
        <p-button label="Exportar CSV" severity="secondary" [outlined]="true" (onClick)="download('taxes')" />
      }
      @case ('inventory') {
        @if (valuation(); as v) {
          <div class="grid gap-3 grid-cols-2 max-w-xl mb-4">
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Inventario valorizado</p>
              <p class="text-2xl font-semibold">{{ cop(v.totalValue) }}</p>
            </div>
            <div class="bg-white rounded-xl shadow p-4">
              <p class="text-sm text-slate-500">Productos con existencia</p>
              <p class="text-2xl font-semibold">{{ v.productCount }}</p>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow overflow-x-auto mb-3">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-left">
                <tr>
                  <th class="p-2">Sucursal</th><th class="p-2">Producto</th><th class="p-2">Categoría</th>
                  <th class="p-2 text-right">Existencia</th><th class="p-2 text-right">Costo promedio</th>
                  <th class="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                @for (r of v.rows; track r.branchId + r.productId) {
                  <tr class="border-t">
                    <td class="p-2">{{ r.branchName }}</td>
                    <td class="p-2"><span class="font-mono text-xs text-slate-500">{{ r.sku }}</span> {{ r.name }}</td>
                    <td class="p-2">{{ r.categoryName ?? '—' }}</td>
                    <td class="p-2 text-right whitespace-nowrap">{{ q(r.quantity) }} {{ r.unitCode }}</td>
                    <td class="p-2 text-right">{{ cop(r.averageCost) }}</td>
                    <td class="p-2 text-right">{{ cop(r.value) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="p-6 text-center text-slate-500">No hay existencias.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-xs text-slate-500 mb-3">Existencias actuales × costo promedio ponderado.</p>
          <p-button label="Exportar CSV" severity="secondary" [outlined]="true" (onClick)="download('inventory/valuation')" />
        }
      }
    }

    <ng-template #salesTable let-rows let-title="title" let-csv="csv">
      <div class="bg-white rounded-xl shadow overflow-x-auto mb-3">
        <table class="w-full text-sm">
          <thead class="bg-slate-50 text-left">
            <tr>
              <th class="p-2">{{ title }}</th><th class="p-2 text-right">Ventas</th><th class="p-2 text-right">Total</th>
              <th class="p-2 text-right">Ticket promedio</th><th class="p-2 text-right">Utilidad</th>
              <th class="p-2 text-right">Margen</th>
            </tr>
          </thead>
          <tbody>
            @for (r of asRows(rows); track r.key) {
              <tr class="border-t">
                <td class="p-2">{{ r.label }}</td>
                <td class="p-2 text-right">{{ r.salesCount }}</td>
                <td class="p-2 text-right">{{ cop(r.total) }}</td>
                <td class="p-2 text-right">{{ cop(r.averageTicket) }}</td>
                <td class="p-2 text-right">{{ cop(r.profit) }}</td>
                <td class="p-2 text-right">{{ pct(r.marginPercent) }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="p-6 text-center text-slate-500">Sin ventas en el periodo.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <p-button label="Exportar CSV" severity="secondary" [outlined]="true" (onClick)="download(asCsv(csv))" />
    </ng-template>
  `,
})
export class ReportsComponent implements OnInit {
  private readonly reports = inject(ReportsApi);
  private readonly organization = inject(OrganizationApi);

  protected readonly tabs = TABS;
  protected readonly quick: { id: QuickRange; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'yesterday', label: 'Ayer' },
    { id: 'last7', label: '7 días' },
    { id: 'thisMonth', label: 'Este mes' },
    { id: 'lastMonth', label: 'Mes anterior' },
  ];
  protected readonly cop = formatCop;
  protected readonly q = formatQuantity;
  protected readonly pct = formatPercent;

  protected readonly tab = signal<Tab>('summary');
  protected readonly loading = signal(false);
  protected readonly branches = signal<Branch[]>([]);
  protected readonly sellers = signal<SalesReportRow[]>([]);
  protected readonly summary = signal<ReportSummary | null>(null);
  protected readonly days = signal<SalesReportRow[]>([]);
  protected readonly branchRows = signal<SalesReportRow[]>([]);
  protected readonly sellerRows = signal<SalesReportRow[]>([]);
  protected readonly payments = signal<PaymentReportRow[]>([]);
  protected readonly products = signal<ProductReportRow[]>([]);
  protected readonly categories = signal<CategoryReportRow[]>([]);
  protected readonly taxes = signal<TaxReportRow[]>([]);
  protected readonly valuation = signal<InventoryValuation | null>(null);

  protected from = quickRange('thisMonth').from;
  protected to = quickRange('thisMonth').to;
  protected branchId: string | null = null;
  protected sellerId: string | null = null;
  protected productOrder: 'total' | 'quantity' = 'total';

  /** Todos los días del rango (los que no tuvieron ventas, en cero). */
  protected readonly dayBars = computed<BarItem[]>(() => {
    const byKey = new Map(this.days().map((d) => [d.key, d.total] as const));
    return daysBetween(this.range().from, this.range().to)
      .map((day) => ({ label: day.slice(5), value: byKey.get(day) ?? 0 }));
  });
  private readonly range = signal({ from: '', to: '' });
  /** Evita que una respuesta vieja (de filtros anteriores) reemplace a la última. */
  private requestSeq = 0;
  protected readonly paymentBars = computed<BarItem[]>(() =>
    this.payments().map((p) => ({ label: p.name, value: p.amount, hint: `${p.count} pagos` })),
  );
  protected readonly categoryBars = computed<BarItem[]>(() =>
    this.categories().map((c) => ({ label: c.categoryName, value: c.total })),
  );

  ngOnInit(): void {
    this.organization.branches({ page: 0, size: 100, sort: 'code,asc' }).subscribe((p) => this.branches.set(p.content));
    this.reload();
  }

  select(tab: Tab): void {
    this.tab.set(tab);
    this.reload();
  }

  setRange(range: QuickRange): void {
    const r = quickRange(range);
    this.from = r.from;
    this.to = r.to;
    this.reload();
  }

  reload(): void {
    // Mientras se edita una fecha el campo queda vacío: no se consulta (el servidor tomaría "hoy").
    if (this.tab() !== 'inventory' && (!this.from || !this.to)) {
      return;
    }
    const filters = this.filters();
    const seq = ++this.requestSeq;
    const current = (): boolean => seq === this.requestSeq;
    const done = (): void => {
      if (current()) {
        this.loading.set(false);
      }
    };
    const apply = <T>(set: (value: T) => void) => ({
      next: (value: T): void => {
        if (current()) {
          set(value);
          this.loading.set(false);
        }
      },
      error: done,
    });
    this.loading.set(true);
    this.range.set({ from: this.from, to: this.to });
    // Vendedores con ventas en el periodo (sin el filtro de vendedor). Si el elegido no vendió, se quita el filtro.
    if (this.tab() !== 'inventory') {
      this.reports.salesBy('by-seller', { ...filters, sellerId: null }).subscribe((rows) => {
        if (!current()) {
          return;
        }
        this.sellers.set(rows);
        if (this.sellerId && !rows.some((r) => r.key === this.sellerId)) {
          this.sellerId = null;
          this.reload();
        }
      });
    }
    switch (this.tab()) {
      case 'summary':
        this.reports.summary(filters).subscribe(apply((s: ReportSummary) => this.summary.set(s)));
        break;
      case 'days':
        this.reports.salesBy('by-day', filters).subscribe(apply((r: SalesReportRow[]) => this.days.set(r)));
        break;
      case 'branches':
        this.reports.salesBy('by-branch', filters).subscribe(apply((r: SalesReportRow[]) => this.branchRows.set(r)));
        break;
      case 'sellers':
        this.reports.salesBy('by-seller', filters).subscribe(apply((r: SalesReportRow[]) => this.sellerRows.set(r)));
        break;
      case 'payments':
        this.reports.byPaymentMethod(filters).subscribe(apply((r: PaymentReportRow[]) => this.payments.set(r)));
        break;
      case 'products':
        this.reports.products(filters, this.productOrder, 50)
          .subscribe(apply((r: ProductReportRow[]) => this.products.set(r)));
        break;
      case 'categories':
        this.reports.categories(filters).subscribe(apply((r: CategoryReportRow[]) => this.categories.set(r)));
        break;
      case 'taxes':
        this.reports.taxes(filters).subscribe(apply((r: TaxReportRow[]) => this.taxes.set(r)));
        break;
      case 'inventory':
        this.reports.valuation(this.branchId).subscribe(apply((v: InventoryValuation) => this.valuation.set(v)));
        break;
    }
  }

  download(report: CsvReport, extra: Record<string, string | number | null> = {}): void {
    this.reports.csv(report, this.filters(), extra).subscribe({
      next: (response) => saveDownload(response, `${report.replace('/', '-')}.csv`),
      // El error ya se muestra en un aviso (interceptor); aquí solo se evita el error no controlado.
      error: () => undefined,
    });
  }

  protected bars(rows: SalesReportRow[]): BarItem[] {
    return rows.map((r) => ({ label: r.label, value: r.total, hint: `${r.salesCount} ventas` }));
  }

  protected taxName(type: string): string {
    return TAX_NAMES[type] ?? type;
  }

  /** La plantilla compartida recibe el contexto sin tipo: aquí se le da. */
  protected asRows(rows: unknown): SalesReportRow[] {
    return Array.isArray(rows) ? (rows as SalesReportRow[]) : [];
  }

  protected asCsv(value: unknown): CsvReport {
    return value as CsvReport;
  }

  private filters(): ReportFilters {
    return { from: this.from || null, to: this.to || null, branchId: this.branchId, sellerId: this.sellerId };
  }
}
