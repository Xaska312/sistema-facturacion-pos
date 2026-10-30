import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { Observable } from 'rxjs';
import { DiningApi, Floor, FloorTable, Tab, TabKind } from '../../core/api/dining.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { FormDialogComponent } from '../../shared/forms/form-dialog.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatCop } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { liveRefresh } from '../../core/realtime/live-refresh';
import { kindGlyph, minutesOpen, openFor } from './dining-labels';

/** Respaldo: cada cuánto se actualiza el salón si no hay conexión en tiempo real (Fase 12b-4). */
const REFRESH_MS = 15_000;

/**
 * Mesas (Fase 12b-2, decisión 269): el salón de la sucursal en baldosas por zona. Libre: toca para abrir la cuenta;
 * ocupada: total, tiempo y personas, toca para verla. Abajo, para llevar y domicilios abiertos.
 */
@Component({
  selector: 'app-floor',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SkeletonModule, PageHeaderComponent,
    FormDialogComponent, EmptyStateComponent, XIconComponent],
  template: `
    <app-page-header title="Mesas" description="Toca una mesa libre para abrir su cuenta o una ocupada para pedir y cobrar.">
      <p-button label="Para llevar" icon="pi pi-shopping-bag" severity="secondary" [outlined]="true" (onClick)="openOther('TAKEAWAY')" />
      <p-button label="Domicilio" icon="pi pi-send" severity="secondary" [outlined]="true" (onClick)="openOther('DELIVERY')" />
      @if (canManage()) {
        <a pButton routerLink="/app/mesas/configurar" label="Configurar" icon="pi pi-cog" severity="secondary"
           [text]="true"></a>
      }
    </app-page-header>

    @if (floor(); as f) {
      @if (f.branches.length > 1) {
        <label class="flex items-center gap-2 text-sm mb-4">
          <span class="font-semibold">Sucursal</span>
          <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="f.branchId" (ngModelChange)="changeBranch($event)">
            @for (b of f.branches; track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
        </label>
      }

      @if (f.zones.length > 1) {
        <nav class="flex gap-2 overflow-x-auto pb-3" aria-label="Zonas">
          <button type="button" class="chip" [attr.aria-pressed]="zone() === null" (click)="zone.set(null)">Todas</button>
          @for (z of f.zones; track z.id) {
            <button type="button" class="chip" [attr.aria-pressed]="zone() === z.id" (click)="zone.set(z.id)">{{ z.name }}</button>
          }
        </nav>
      }

      @if (f.zones.length === 0) {
        <app-empty-state icon="pi pi-table" title="Aún no tienes mesas"
                         [message]="canManage() ? 'Crea tus zonas (Salón, Terraza) y sus mesas para empezar.' : 'Pide al administrador que configure las mesas.'"
                         [actionLabel]="canManage() ? 'Configurar mesas' : null" (action)="router.navigate(['/app/mesas/configurar'])" />
      }

      @for (z of shownZones(); track z.id) {
        <section class="mb-6" [attr.aria-labelledby]="'zone-' + z.id">
          <h2 [id]="'zone-' + z.id" class="text-base font-bold tracking-tight mb-3">
            {{ z.name }} <span class="text-sm font-normal text-muted">· {{ busy(z.tables) }} de {{ z.tables.length }} ocupadas</span>
          </h2>
          <ul class="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" [attr.aria-label]="'Mesas de ' + z.name">
            @for (t of z.tables; track t.id) {
              <li>
                @if (t.tab; as tab) {
                  <a [routerLink]="['/app/mesas/cuenta', tab.id]" class="table-tile table-tile--busy"
                     [class.table-tile--late]="late(tab.openedAt)"
                     [attr.aria-label]="'Mesa ' + t.name + ', ocupada, ' + cop(tab.total) + ', ' + since(tab.openedAt) + (tab.ready ? ', con platos listos para llevar' : '')">
                    <span class="flex items-start justify-between gap-2">
                      <span class="text-2xl font-extrabold tracking-tight">{{ t.name }}</span>
                      @if (tab.ready > 0) {
                        <span class="pill pill--ready">{{ tab.ready === 1 ? 'Lista' : tab.ready + ' listas' }}</span>
                      } @else {
                        <span class="pill">{{ since(tab.openedAt) }}</span>
                      }
                    </span>
                    <span>
                      <span class="block text-lg font-extrabold tabular-nums">{{ cop(tab.total) }}</span>
                      <span class="block text-xs">{{ tab.guests ? tab.guests + ' pers. · ' : '' }}{{ tab.items }} prod.</span>
                    </span>
                  </a>
                } @else {
                  <button type="button" class="table-tile" (click)="askOpen(t)"
                          [attr.aria-label]="'Mesa ' + t.name + ', libre. Abrir cuenta'">
                    <span class="text-2xl font-extrabold tracking-tight">{{ t.name }}</span>
                    <span class="text-xs text-muted">Libre{{ t.seats ? ' · ' + t.seats + ' puestos' : '' }}</span>
                  </button>
                }
              </li>
            }
          </ul>
        </section>
      }

      @if (f.others.length > 0) {
        <section aria-labelledby="others-title">
          <h2 id="others-title" class="text-base font-bold tracking-tight mb-3">Para llevar y domicilios</h2>
          <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            @for (o of f.others; track o.id) {
              <li>
                <a [routerLink]="['/app/mesas/cuenta', o.id]" class="card p-4 flex items-center gap-3 hover:border-brand">
                  <app-xicon [name]="glyph(o.kind)" [size]="30" />
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold truncate">{{ o.label }}</span>
                    <span class="block text-xs text-muted">{{ since(o.openedAt) }} · {{ o.items }} prod.{{ o.ready ? ' · Lista' : '' }}</span>
                  </span>
                  <span class="font-extrabold tabular-nums">{{ cop(o.total) }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
    } @else {
      <div class="grid gap-3 grid-cols-2 sm:grid-cols-4" aria-busy="true">
        @for (i of [0, 1, 2, 3, 4, 5, 6, 7]; track i) {
          <p-skeleton height="7rem" borderRadius="1.25rem" />
        }
      </div>
    }

    <app-form-dialog [(visible)]="openDialog" [header]="openTitle()" width="26rem" submitLabel="Abrir cuenta"
                     submitIcon="pi pi-check" [dirty]="false" [invalidMessage]="openProblem()" [save]="openRequest"
                     [successMessage]="null" (saved)="opened($event)">
      @if (openKind() === 'TABLE') {
        <div class="flex flex-col gap-1">
          <label for="guests" class="text-sm font-semibold">Personas <span class="font-normal text-muted">(opcional)</span></label>
          <input pInputText id="guests" type="number" min="1" max="99" inputmode="numeric" [(ngModel)]="guests" />
        </div>
      } @else {
        <div class="flex flex-col gap-1">
          <label for="customer-name" class="text-sm font-semibold">Nombre del cliente
            @if (openKind() === 'TAKEAWAY') { <span class="font-normal text-muted">(opcional)</span> }</label>
          <input pInputText id="customer-name" maxlength="120" [(ngModel)]="customerName" />
        </div>
        @if (openKind() === 'DELIVERY') {
          <div class="flex flex-col gap-1">
            <label for="phone" class="text-sm font-semibold">Teléfono</label>
            <input pInputText id="phone" maxlength="30" inputmode="tel" [(ngModel)]="phone" />
          </div>
          <div class="flex flex-col gap-1">
            <label for="address" class="text-sm font-semibold">Dirección</label>
            <input pInputText id="address" maxlength="200" [(ngModel)]="address" />
          </div>
        }
      }
    </app-form-dialog>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-height: 2.75rem;
      padding: 0 1rem;
      border-radius: 9999px;
      border: 1px solid var(--surface-border);
      background: var(--surface);
      font-size: 0.875rem;
      font-weight: 600;
    }
    .chip[aria-pressed='true'] { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
    .table-tile {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      min-height: 7rem;
      padding: 0.875rem 1rem;
      border-radius: 1.25rem;
      border: 2px dashed var(--field-border);
      background: var(--surface);
      color: var(--text);
      text-align: left;
      text-decoration: none;
      transition: border-color 150ms, transform 100ms;
    }
    .table-tile:hover { border-color: var(--brand); }
    .table-tile:active { transform: scale(0.98); }
    .table-tile--busy {
      border: 2px solid var(--brand);
      background: var(--brand-soft);
      color: var(--brand-soft-text);
    }
    .table-tile--late { border-color: var(--warning); background: var(--warning-soft); color: var(--warning-soft-text); }
    .pill {
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: var(--surface);
      color: var(--text);
    }
    .pill--ready { background: var(--success-soft); color: var(--success-soft-text); border: 1px solid var(--success); }
  `,
})
export class FloorComponent implements OnInit {
  private readonly api = inject(DiningApi);
  protected readonly router = inject(Router);

  protected readonly canManage = permissionFlag('tables:manage');
  protected readonly floor = signal<Floor | null>(null);
  protected readonly zone = signal<string | null>(null);
  protected readonly shownZones = computed(() => {
    const f = this.floor();
    const z = this.zone();
    return f ? f.zones.filter((x) => z === null || x.id === z) : [];
  });
  protected readonly cop = formatCop;
  protected readonly glyph = kindGlyph;

  protected openDialog = false;
  protected readonly openKind = signal<TabKind>('TABLE');
  private readonly openTable = signal<FloorTable | null>(null);
  protected guests: number | null = null;
  protected customerName = '';
  protected phone = '';
  protected address = '';
  private branchId: string | null = null;
  private now = new Date();

  constructor() {
    // Al instante con los avisos en tiempo real (Fase 12b-4); sin conexión, cada 15 s.
    liveRefresh({ when: (e) => e.type === 'TAB_CHANGED' || e.type === 'TICKET_STATUS', load: () => this.load(),
      fallbackMs: REFRESH_MS });
  }

  ngOnInit(): void {
    this.load();
  }

  /** Al volver a la pestaña o a la app, el salón se pone al día. */
  @HostListener('window:focus')
  protected load(): void {
    this.api.floor(this.branchId).subscribe({
      next: (f) => {
        this.now = new Date();
        this.branchId = f.branchId;
        this.floor.set(f);
        if (this.zone() && !f.zones.some((z) => z.id === this.zone())) {
          this.zone.set(null);
        }
      },
      error: () => this.floor.update((f) => f ?? { branchId: '', branches: [], zones: [], others: [] }),
    });
  }

  protected changeBranch(id: string): void {
    this.branchId = id;
    this.zone.set(null);
    this.load();
  }

  protected busy(tables: FloorTable[]): number {
    return tables.filter((t) => t.tab !== null).length;
  }

  protected since(openedAt: string): string {
    return openFor(openedAt, this.now);
  }

  /** Más de una hora abierta: la baldosa cambia de color para que no se olvide. */
  protected late(openedAt: string): boolean {
    return minutesOpen(openedAt, this.now) >= 60;
  }

  protected openTitle(): string {
    const t = this.openTable();
    return this.openKind() === 'TABLE' ? `Abrir mesa ${t?.name ?? ''}` : this.openKind() === 'TAKEAWAY' ? 'Para llevar' : 'Domicilio';
  }

  protected askOpen(table: FloorTable): void {
    this.openKind.set('TABLE');
    this.openTable.set(table);
    this.guests = null;
    this.openDialog = true;
  }

  protected openOther(kind: TabKind): void {
    this.openKind.set(kind);
    this.openTable.set(null);
    this.customerName = '';
    this.phone = '';
    this.address = '';
    this.openDialog = true;
  }

  protected openProblem(): string | null {
    if (this.openKind() === 'DELIVERY' && !this.address.trim()) {
      return 'Escribe la dirección del domicilio.';
    }
    if (this.guests !== null && !(this.guests >= 1 && this.guests <= 99)) {
      return 'Las personas van de 1 a 99.';
    }
    return null;
  }

  protected readonly openRequest = (): Observable<Tab> => {
    const kind = this.openKind();
    return this.api.open(kind === 'TABLE'
      ? { kind, tableId: this.openTable()?.id ?? null, guests: this.guests || null }
      : { kind, branchId: this.branchId, customerName: this.customerName.trim() || null, phone: this.phone.trim() || null,
        address: this.address.trim() || null });
  };

  protected opened(tab: unknown): void {
    void this.router.navigate(['/app/mesas/cuenta', (tab as Tab).id]);
  }
}
