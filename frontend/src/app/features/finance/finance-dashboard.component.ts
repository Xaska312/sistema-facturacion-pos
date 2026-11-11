import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FinanceDashboard, FinanceDashboardApi } from '../../core/api/finance.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { formatDay } from '../orders/order-text';
import { methodLabel } from '../pos/pos-labels';
import { breakEvenWords, progressPercent, versusText } from './finance-text';

/**
 * Tablero de Finanzas (parte D, decisión 324): el mes en curso de un vistazo, pensado para el celular: cuánto vas
 * ganando, la plata que entró y salió por cada medio, lo que te deben y lo que debes, los gastos frente al mes
 * anterior y cuánto hay que vender al día para cubrirlos.
 */
@Component({
  selector: 'app-finance-dashboard',
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="Finanzas" glyph="finance" description="Cómo va la plata del negocio este mes." />

    @if (data(); as d) {
      <p class="text-sm text-muted -mt-2 mb-3">Del {{ day(d.from) }} al {{ day(d.to) }} · todo el negocio</p>

      <!-- 1. Cuánto vas ganando -->
      <section class="card p-4" [class.bg-success-soft]="d.operatingProfit > 0" [class.bg-danger-soft]="d.operatingProfit < 0"
               aria-labelledby="profit-title">
        <p id="profit-title" class="text-sm">{{ d.operatingProfit < 0 ? 'Vas perdiendo' : 'Vas ganando' }}</p>
        <p class="text-3xl font-extrabold tabular-nums">{{ cop(abs(d.operatingProfit)) }}</p>
        <p class="text-xs mt-1">Vendiste {{ cop(d.netSales) }} sin IVA · te quedaron {{ cop(d.grossProfit) }} ·
          gastos {{ cop(d.expenses.thisMonth) }}</p>
        @if (canIncome()) {
          <a routerLink="/app/estado-de-resultados" class="inline-block text-sm text-brand font-medium hover:underline mt-2">
            Ver el estado de resultados</a>
        }
      </section>

      <!-- 2. Punto de equilibrio -->
      <section class="card p-4 mt-3" aria-labelledby="even-title">
        <h2 id="even-title" class="font-bold tracking-tight">Cuánto necesitas vender</h2>
        @if (d.breakEven.perDay !== null) {
          <p class="text-3xl font-extrabold tabular-nums mt-1">{{ cop(d.breakEven.perDay) }} <span class="text-base font-medium text-muted">al día</span></p>
          <div class="mt-3">
            <div class="flex justify-between text-xs text-muted mb-1">
              <span>Llevas {{ cop(d.breakEven.monthSales) }}</span>
              <span>Meta a hoy {{ cop(d.breakEven.monthTarget) }}</span>
            </div>
            <div class="h-3 rounded-full bg-surface-alt overflow-hidden" role="progressbar" [attr.aria-valuenow]="progress()"
                 aria-valuemin="0" aria-valuemax="100" aria-label="Ventas del mes frente a la meta a hoy">
              <div class="h-full rounded-full" [class.bg-success]="progress() >= 100" [class.bg-warning]="progress() < 100"
                   [style.width.%]="progress()"></div>
            </div>
          </div>
        }
        <ul class="mt-3 flex flex-col gap-1 text-sm">
          @for (line of evenWords(); track $index) { <li>{{ line }}</li> }
        </ul>
      </section>

      <div class="grid gap-3 mt-3 md:grid-cols-2">
        <!-- 3. Lo que te deben y lo que debes -->
        <section class="card p-4" aria-labelledby="balances-title">
          <h2 id="balances-title" class="font-bold tracking-tight mb-2">Te deben</h2>
          <p class="flex justify-between gap-2 text-sm"><span>Fiados <span class="text-xs text-muted">({{ d.balances.creditCustomers }} {{ d.balances.creditCustomers === 1 ? 'cliente' : 'clientes' }})</span></span>
            <span class="font-semibold tabular-nums">{{ cop(d.balances.creditOwed) }}</span></p>
          <p class="flex justify-between gap-2 text-sm mt-1"><span>Pedidos por cobrar <span class="text-xs text-muted">({{ d.balances.openOrders }} abiertos)</span></span>
            <span class="font-semibold tabular-nums">{{ cop(d.balances.ordersOwed) }}</span></p>
          <p class="flex justify-between gap-2 text-sm font-bold border-t border-line mt-2 pt-2"><span>Total</span>
            <span class="tabular-nums">{{ cop(d.balances.creditOwed + d.balances.ordersOwed) }}</span></p>

          <h2 class="font-bold tracking-tight mt-4 mb-2">Debes a proveedores</h2>
          <p class="text-2xl font-extrabold tabular-nums">{{ cop(d.balances.suppliersOwed) }}</p>
          @if (d.balances.suppliersOverdue > 0) {
            <p class="text-sm text-danger font-medium">{{ cop(d.balances.suppliersOverdue) }} vencido</p>
          }
          @if (d.balances.suppliersDueSoon > 0) {
            <p class="text-sm text-warning">{{ cop(d.balances.suppliersDueSoon) }} vence en los próximos 7 días</p>
          }
          @if (canPayables() && d.balances.suppliersOwed > 0) {
            <a routerLink="/app/cuentas-por-pagar" class="inline-block text-sm text-brand font-medium hover:underline mt-1">Ver cuentas por pagar</a>
          }
        </section>

        <!-- 4. Gastos del mes -->
        <section class="card p-4" aria-labelledby="expenses-title">
          <h2 id="expenses-title" class="font-bold tracking-tight">Gastos del mes</h2>
          <p class="text-2xl font-extrabold tabular-nums mt-1">{{ cop(d.expenses.thisMonth) }}</p>
          <p class="text-sm" [class.text-danger]="(d.expenses.changePercent ?? 0) > 0"
             [class.text-success]="(d.expenses.changePercent ?? 0) < 0" [class.text-muted]="!d.expenses.changePercent">
            {{ versus(d.expenses.changePercent) }}</p>
          @if (d.expenses.top.length > 0) {
            <ul class="mt-2 flex flex-col gap-1 text-sm">
              @for (c of d.expenses.top; track c.categoryId ?? 'none') {
                <li class="flex justify-between gap-2"><span>{{ c.name }}</span><span class="tabular-nums">{{ cop(c.total) }}</span></li>
              }
            </ul>
          }
          @if (d.expenses.unpaidRecurring > 0) {
            <p class="mt-2 text-sm rounded-lg bg-warning-soft text-warning-soft-fg p-2">Faltan {{ cop(d.expenses.unpaidRecurringTotal) }}
              de gastos fijos por pagar este mes.</p>
          }
          @if (canExpenses()) {
            <a routerLink="/app/gastos" class="inline-block text-sm text-brand font-medium hover:underline mt-2">Ver gastos</a>
          }
        </section>
      </div>

      <!-- 5. Plata que entró y salió -->
      <section class="card p-4 mt-3" aria-labelledby="flow-title">
        <h2 id="flow-title" class="font-bold tracking-tight">Plata que entró y salió</h2>
        <p class="text-xs text-muted mb-3">Entró: ventas, abonos de fiado y anticipos. Salió: gastos y pagos a proveedores.</p>
        <div class="grid grid-cols-3 gap-2 text-center mb-3">
          <div class="rounded-xl bg-surface-alt p-2"><p class="text-xs text-muted">Entró</p>
            <p class="font-bold tabular-nums text-success">{{ cop(d.flow.in) }}</p></div>
          <div class="rounded-xl bg-surface-alt p-2"><p class="text-xs text-muted">Salió</p>
            <p class="font-bold tabular-nums text-danger">{{ cop(d.flow.out) }}</p></div>
          <div class="rounded-xl bg-surface-alt p-2"><p class="text-xs text-muted">Queda</p>
            <p class="font-bold tabular-nums">{{ cop(d.flow.net) }}</p></div>
        </div>
        <ul class="flex flex-col">
          @for (m of d.flow.byMethod; track m.paymentMethodId) {
            <li class="flex flex-wrap items-baseline justify-between gap-x-3 py-2 border-t border-line first:border-t-0 text-sm">
              <span class="font-medium flex-1 min-w-32">{{ label(m.name, m.cash) }}</span>
              <span class="tabular-nums text-success">+{{ cop(m.in) }}</span>
              <span class="tabular-nums text-danger">−{{ cop(m.out) }}</span>
              <span class="tabular-nums font-semibold w-28 text-right">{{ cop(m.net) }}</span>
            </li>
          } @empty {
            <li class="py-3 text-sm text-muted">Todavía no ha entrado ni salido plata este mes.</li>
          }
        </ul>
      </section>
    } @else if (error()) {
      <p class="card p-4 text-sm text-danger" role="alert">No se pudo cargar el tablero. Intenta de nuevo.</p>
    } @else {
      <p class="card p-4 text-sm text-muted">Cargando…</p>
    }
  `,
})
export class FinanceDashboardComponent implements OnInit {
  private readonly api = inject(FinanceDashboardApi);
  protected readonly canIncome = permissionFlag('finance:read');
  protected readonly canExpenses = permissionFlag('expenses:read');
  protected readonly canPayables = permissionFlag('purchases:read');

  protected readonly data = signal<FinanceDashboard | null>(null);
  protected readonly error = signal(false);
  protected readonly progress = computed(() => {
    const d = this.data();
    return d ? progressPercent(d.breakEven.monthSales, d.breakEven.monthTarget) : 0;
  });
  protected readonly evenWords = computed(() => {
    const d = this.data();
    return d ? breakEvenWords(d) : [];
  });

  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly versus = versusText;

  ngOnInit(): void {
    this.api.dashboard().subscribe({ next: (d) => this.data.set(d), error: () => this.error.set(true) });
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  protected label(name: string, cash: boolean): string {
    return cash ? methodLabel('CASH', name) : name;
  }
}
