import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { CreditApi } from '../../core/api/credit.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrdersApi } from '../../core/api/orders.api';
import { ReportsApi } from '../../core/api/reports.api';
import { AuthService } from '../../core/auth/auth.service';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { XIconName } from '../../shared/icons/xicons';
import { formatCop } from '../../shared/money';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { MyDayComponent } from '../dashboard/my-day.component';
import { StockAlertsComponent } from '../dashboard/stock-alerts.component';
import { FirstStepsComponent } from '../onboarding/first-steps.component';
import { OrdersAlertComponent } from '../orders/orders-alert.component';
import { describeCapabilities, firstName, greeting, quickActions } from './capabilities';
import { MENU } from './menu';

/** Dato de una baldosa del inicio (se llena cuando llega su consulta; si falla, no aparece). */
interface Tile {
  route: string;
  glyph: XIconName;
  label: string;
  value: string;
  hint: string;
}

/** Ícono propio de la ruta (el del menú); los accesos sin ruta en el menú usan el de Inicio. */
export function glyphFor(route: string): XIconName {
  return MENU.find((m) => m.route === route)?.glyph ?? 'home';
}

/**
 * Inicio en baldosas (identidad, decisión 263): una baldosa grande con el acceso principal (Vender, si puede) y lo
 * que lleva hoy, baldosas con lo que hay que atender (fiados por cobrar, pedidos de hoy, productos por agotarse) y
 * los demás accesos; debajo, los primeros pasos y el tablero o "Mi día". Cada dato se pide solo con su permiso.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, SkeletonModule, XIconComponent, DashboardComponent, MyDayComponent, StockAlertsComponent,
    FirstStepsComponent, OrdersAlertComponent],
  template: `
    <h1 class="sr-only">{{ title }}</h1>
    @if (hero(); as h) {
      <nav data-tour="quick-actions" aria-label="Accesos rápidos" class="bento mb-6">
        <a [routerLink]="h.route" class="tile tile--hero">
          <span class="flex items-start justify-between">
            <app-xicon [name]="glyph(h.route)" [size]="64" />
            @if (h.route === '/pos') {
              <span class="hero-key">F1</span>
            }
          </span>
          <span>
            <span class="block text-base hero-soft">{{ title }}</span>
            <span class="block text-5xl md:text-6xl font-extrabold tracking-tight leading-none">{{ h.label }}</span>
            <span class="block mt-2 hero-soft">{{ todayLine() ?? h.hint }}</span>
          </span>
        </a>
        @for (t of tiles(); track t.route) {
          <a [routerLink]="t.route" class="tile">
            <app-xicon [name]="t.glyph" [size]="36" />
            <span>
              <span class="block text-sm text-muted">{{ t.label }}</span>
              <span class="block text-2xl font-extrabold tracking-tight">{{ t.value }}</span>
              <span class="block text-xs text-muted mt-0.5">{{ t.hint }}</span>
            </span>
          </a>
        }
        @for (a of others(); track a.route) {
          <a [routerLink]="a.route" class="tile tile--small">
            <app-xicon [name]="glyph(a.route)" [size]="30" />
            <span>
              <span class="block font-bold">{{ a.label }}</span>
              <span class="block text-xs text-muted">{{ a.hint }}</span>
            </span>
          </a>
        }
      </nav>
    }

    <app-first-steps class="block mb-5" />

    <!-- Pedidos atrasados o para hoy (decisión 258); no ocupa espacio si no hay. -->
    <app-orders-alert class="block mb-5 empty:hidden" />

    <!-- Las gráficas (Chart.js) se cargan aparte, después de pintar la página. -->
    @if (auth.hasPermission('reports:read')) {
      @defer {
        <app-dashboard />
      } @placeholder (minimum 200ms) {
        <div class="card p-4 mb-4"><p-skeleton height="20rem" /></div>
      }
    } @else {
      <div class="flex flex-col gap-4 mb-4">
        @if (auth.hasPermission('sales:read')) {
          @defer {
            <app-my-day />
          } @placeholder (minimum 200ms) {
            <div class="card p-4"><p-skeleton height="6rem" /></div>
          }
        }
        <app-stock-alerts class="max-w-xl" />
      </div>
    }

    <!-- Sin ningún permiso el inicio queda vacío: se avisa. -->
    @if (capabilities().length === 0) {
      <section class="card p-4 mt-4" role="status">
        <p class="text-sm">Aún no tienes permisos en este negocio. Pide a quien lo administra que te asigne un rol.</p>
      </section>
    }
  `,
  styles: `
    .bento {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-auto-rows: minmax(8.5rem, auto);
    }
    @media (min-width: 1024px) {
      .bento { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    .tile {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.25rem;
      border-radius: 1.75rem;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      box-shadow: var(--elevation-card);
      color: var(--text);
      text-decoration: none;
      transition: border-color 150ms, transform 150ms;
    }
    .tile:hover { border-color: var(--brand); }
    .tile:active { transform: scale(0.98); }
    .tile--hero {
      grid-column: span 2;
      grid-row: span 2;
      padding: 1.75rem 2rem;
      border: none;
      background: linear-gradient(160deg, var(--brand), var(--brand-hover));
      color: var(--brand-contrast);
      --xicon-fill: var(--brand-contrast);
    }
    .tile--hero:hover { filter: brightness(1.05); }
    .hero-soft { opacity: 0.85; }
    .hero-key {
      padding: 0.35rem 0.75rem;
      border-radius: 9999px;
      font-weight: 700;
      background: color-mix(in srgb, var(--brand-contrast) 18%, transparent);
    }
    .tile--small {
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
    }
  `,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  private readonly reports = inject(ReportsApi);
  private readonly credit = inject(CreditApi);
  private readonly orders = inject(OrdersApi);
  private readonly inventory = inject(InventoryApi);

  protected readonly title = `${greeting()}${firstName(this.auth.user()?.fullName) ? ', ' + firstName(this.auth.user()?.fullName) : ''}`;
  protected readonly actions = computed(() => quickActions(this.auth.permissions()));
  protected readonly capabilities = computed(() => describeCapabilities(this.auth.permissions()));
  /** El primer acceso (Vender, si puede) va en la baldosa grande; los demás en baldosas pequeñas. */
  protected readonly hero = computed(() => this.actions()[0] ?? null);
  protected readonly others = computed(() => this.actions().slice(1));
  protected readonly glyph = glyphFor;

  private readonly today = signal<{ total: number; count: number } | null>(null);
  private readonly creditDue = signal<Tile | null>(null);
  private readonly ordersToday = signal<Tile | null>(null);
  private readonly lowStock = signal<Tile | null>(null);
  protected readonly tiles = computed(() =>
    [this.creditDue(), this.ordersToday(), this.lowStock()].filter((t): t is Tile => t !== null));

  protected readonly todayLine = computed(() => {
    const t = this.today();
    if (!t) {
      return null;
    }
    return t.count === 0 ? 'Aún no hay ventas hoy' : `Hoy vas en ${formatCop(t.total)} · ${t.count} ${t.count === 1 ? 'venta' : 'ventas'}`;
  });

  constructor() {
    const can = (p: string) => this.auth.hasPermission(p);
    if (can('sales:read')) {
      this.reports.myDay().subscribe({ next: (d) => this.today.set({ total: d.total, count: d.salesCount }), error: () => undefined });
    }
    if (can('credit:read')) {
      this.credit.summary().subscribe({
        next: (s) => this.creditDue.set({ route: '/app/fiados', glyph: 'credit', label: 'Por cobrar en fiados',
          value: formatCop(s.totalBalance), hint: s.customers === 1 ? '1 cliente' : `${s.customers} clientes` }),
        error: () => undefined,
      });
    }
    if (can('orders:read')) {
      this.orders.summary(true).subscribe({
        next: (s) => this.ordersToday.set({ route: '/app/pedidos', glyph: 'orders', label: 'Pedidos para hoy',
          value: String(s.dueToday), hint: s.overdue > 0 ? `${s.overdue} atrasados` : `${s.open} por entregar` }),
        error: () => undefined,
      });
    }
    if (can('inventory:read')) {
      this.inventory.alerts(null).subscribe({
        next: (list) => this.lowStock.set({ route: '/app/inventario', glyph: 'stock', label: 'Por agotarse',
          value: String(list.length), hint: list.length === 0 ? 'Todo en orden' : list.slice(0, 2).map((a) => a.name).join(' · ') }),
        error: () => undefined,
      });
    }
  }
}
