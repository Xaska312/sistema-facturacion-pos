import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { BranchOption, DiningApi } from '../../core/api/dining.api';
import { KitchenApi, KitchenStation, KitchenTicket } from '../../core/api/kitchen.api';
import { permissionFlag } from '../../core/auth/permission-flag';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatQuantity } from '../../shared/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { ReceiptWidth, loadReceiptWidth, saveReceiptWidth } from '../../shared/receipt/receipt-prefs';
import { openFor } from '../dining/dining-labels';
import { liveRefresh } from '../../core/realtime/live-refresh';
import { printComandas } from './comanda-print';
import { ticketStatusLabel } from './ticket-labels';
import { KitchenPrinterService } from './kitchen-printer';

/** Respaldo: cada cuánto se actualiza la lista sin conexión en tiempo real (Fase 12b-4). */
const REFRESH_MS = 10_000;

/**
 * Comandas (Fase 12b-3, decisión 270): las que salieron a cocina y bar en las últimas horas, por estación, con
 * "Imprimir" (la segunda vez queda como reimpresión en la auditoría). Arriba se marca si este equipo es la impresora
 * de comandas de alguna estación.
 */
@Component({
  selector: 'app-tickets',
  imports: [FormsModule, RouterLink, ButtonModule, SkeletonModule, PageHeaderComponent, EmptyStateComponent, XIconComponent],
  template: `
    <app-page-header title="Comandas" description="Lo que se ha enviado a cocina y bar en las últimas horas.">
      @if (canDisplay()) {
        <a pButton routerLink="/app/cocina" label="Pantalla de cocina" icon="pi pi-desktop" severity="secondary"
           [outlined]="true"></a>
      }
      @if (canManage()) {
        <a pButton routerLink="/app/comandas/estaciones" label="Estaciones" icon="pi pi-cog" severity="secondary"
           [outlined]="true"></a>
      }
    </app-page-header>

    <section class="card p-4 md:p-5 mb-5" aria-labelledby="printer-title">
      <div class="flex flex-wrap items-start gap-3">
        <app-xicon name="comanda" [size]="30" />
        <div class="min-w-0 flex-1">
          <h2 id="printer-title" class="font-bold">Impresora de este equipo</h2>
          <p class="text-sm text-muted">
            Marca las estaciones cuyas comandas salen por la impresora conectada a este equipo. Mientras XASKA esté
            abierto aquí, en cualquier pantalla, las imprime solas.
          </p>
        </div>
      </div>
      @if (stations(); as list) {
        <div class="flex flex-wrap gap-2 mt-3" role="group" aria-label="Estaciones que imprime este equipo">
          @for (s of active(list); track s.id) {
            <label class="chip chip--toggle" [class.chip--on]="printsHere(s.id)">
              <input type="checkbox" class="sr-only" [checked]="printsHere(s.id)" (change)="togglePrinter(s.id)" />
              <i class="pi" [class.pi-check]="printsHere(s.id)" [class.pi-print]="!printsHere(s.id)" aria-hidden="true"></i>
              {{ s.name }}
            </label>
          }
        </div>
      }
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm">
        <label class="flex items-center gap-2">
          <span>Papel</span>
          <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="width()" (ngModelChange)="setWidth($event)">
            <option [ngValue]="80">80 mm</option>
            <option [ngValue]="58">58 mm</option>
          </select>
        </label>
        <p-button label="Imprimir prueba" icon="pi pi-print" [text]="true" size="small" (onClick)="test()" />
        @if (printer.config(); as c) {
          <span class="text-brand font-semibold" role="status">
            Este equipo imprime {{ stationNames(c.stationIds) }}{{ printer.lastPrinted() ? ' · última: #' + printer.lastPrinted() : '' }}
          </span>
        }
      </div>
      <p class="text-xs text-muted mt-2">
        Para que no pregunte antes de imprimir, abre Chrome con <code>--kiosk-printing</code> (en el manual: Restaurante → Comandas).
      </p>
    </section>

    @if (branches().length > 1) {
      <label class="flex items-center gap-2 text-sm mb-4">
        <span class="font-semibold">Sucursal</span>
        <select class="border rounded-[10px] px-3 min-h-11" [ngModel]="branchId()" (ngModelChange)="changeBranch($event)">
          @for (b of branches(); track b.id) {
            <option [value]="b.id">{{ b.name }}</option>
          }
        </select>
      </label>
    }

    @if ((stations()?.length ?? 0) > 1) {
      <nav class="flex gap-2 overflow-x-auto pb-3" aria-label="Estaciones">
        <button type="button" class="chip chip--toggle" [class.chip--on]="filter() === null" (click)="filter.set(null)">Todas</button>
        @for (s of stations() ?? []; track s.id) {
          <button type="button" class="chip chip--toggle" [class.chip--on]="filter() === s.id" (click)="filter.set(s.id)">{{ s.name }}</button>
        }
      </nav>
    }

    @if (tickets(); as list) {
      @if (shown().length === 0) {
        <app-empty-state icon="pi pi-print" title="Sin comandas recientes"
                         message="Cuando se envíe un pedido desde una cuenta, la comanda aparece aquí." />
      } @else {
        <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Comandas">
          @for (t of shown(); track t.id) {
            <li class="card p-4 flex flex-col gap-2">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-bold uppercase tracking-wide text-muted">
                    {{ t.stationName }} · #{{ t.number }} · {{ t.type === 'VOID' ? 'Anulación de #' + t.voidOfNumber : statusLabel(t.status) }}
                  </p>
                  <h2 class="text-xl font-extrabold tracking-tight leading-tight">{{ t.tabLabel }}</h2>
                  <p class="text-xs text-muted">hace {{ since(t.sentAt) }}{{ t.sentByName ? ' · ' + t.sentByName : '' }}</p>
                </div>
                <span class="pill" [class.pill--done]="t.printCount > 0">
                  {{ t.printCount === 0 ? 'Sin imprimir' : t.printCount === 1 ? 'Impresa' : 'Impresa ×' + t.printCount }}
                </span>
              </div>
              <ul class="divide-y divide-line" [attr.aria-label]="'Productos de la comanda ' + t.number">
                @for (i of t.items; track i.id) {
                  <li class="py-1.5" [class.opacity-50]="i.voided">
                    <p class="font-bold" [class.line-through]="i.voided">{{ q(i.quantity) }} · {{ i.name }}</p>
                    @for (m of i.modifiers; track $index) {
                      @if (m.highlight) {
                        <p class="text-sm font-extrabold text-brand">{{ m.groupName }}: {{ m.name }}</p>
                      } @else {
                        <p class="text-sm">+ {{ m.name }}{{ m.quantity > 1 ? ' ×' + m.quantity : '' }}</p>
                      }
                    }
                    @if (i.note) { <p class="text-sm italic">“{{ i.note }}”</p> }
                    @if (i.voided) { <p class="text-xs font-semibold text-danger">Anulado</p> }
                  </li>
                }
              </ul>
              @if (t.notes) { <p class="text-sm"><span class="text-muted">Nota:</span> {{ t.notes }}</p> }
              <div class="flex flex-wrap gap-2 mt-auto pt-1">
                <p-button [label]="t.printCount === 0 ? 'Imprimir' : 'Reimprimir'" icon="pi pi-print" severity="secondary"
                          [outlined]="true" size="small" (onClick)="print(t)" />
                <a pButton [routerLink]="['/app/mesas/cuenta', t.tabId]" label="Ver cuenta" [text]="true" size="small"></a>
              </div>
            </li>
          }
        </ul>
      }
    } @else {
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        @for (i of [0, 1, 2]; track i) {
          <p-skeleton height="12rem" borderRadius="1.25rem" />
        }
      </div>
    }
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      min-height: 2.75rem;
      padding: 0.125rem 0.875rem;
      border-radius: 9999px;
      background: var(--surface);
      border: 1px solid var(--surface-border);
      font-size: 0.875rem;
      font-weight: 700;
      white-space: nowrap;
      cursor: pointer;
    }
    .chip--on { background: var(--brand-soft); color: var(--brand-soft-text); border-color: var(--brand); }
    .chip--toggle:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    .pill {
      flex-shrink: 0;
      padding: 0.125rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      background: var(--warning-soft);
      color: var(--warning-soft-text);
    }
    .pill--done { background: var(--surface-alt); color: var(--text-muted); }
  `,
})
export class TicketsComponent implements OnInit {
  private readonly api = inject(KitchenApi);
  private readonly dining = inject(DiningApi);
  protected readonly printer = inject(KitchenPrinterService);

  protected readonly canManage = permissionFlag('kitchen:manage');
  protected readonly canDisplay = permissionFlag('kitchen:view');
  protected readonly stations = signal<KitchenStation[] | null>(null);
  protected readonly tickets = signal<KitchenTicket[] | null>(null);
  protected readonly branches = signal<BranchOption[]>([]);
  protected readonly branchId = signal<string | null>(null);
  protected readonly filter = signal<string | null>(null);
  protected readonly width = signal<ReceiptWidth>(loadReceiptWidth());
  protected readonly q = formatQuantity;
  protected readonly statusLabel = ticketStatusLabel;

  protected readonly shown = computed(() => {
    const f = this.filter();
    return (this.tickets() ?? []).filter((t) => f === null || t.stationId === f);
  });

  constructor() {
    liveRefresh({ when: (e) => e.type !== 'TAB_CHANGED', load: () => this.loadTickets(), fallbackMs: REFRESH_MS });
  }

  ngOnInit(): void {
    this.api.stations().subscribe({ next: (list) => this.stations.set(list), error: () => this.stations.set([]) });
    // Las sucursales vienen del salón (quien envía comandas atiende mesas); sin él, la sucursal por defecto.
    this.dining.floor(null).subscribe({
      next: (f) => {
        this.branches.set(f.branches);
        this.branchId.set(f.branchId);
        this.loadTickets();
      },
      error: () => this.loadTickets(),
    });
  }

  private loadTickets(): void {
    this.api.tickets(this.branchId()).subscribe({ next: (list) => this.tickets.set(list), error: () => this.tickets.set([]) });
  }

  protected changeBranch(id: string): void {
    this.branchId.set(id);
    this.tickets.set(null);
    this.loadTickets();
  }

  protected active(list: readonly KitchenStation[]): KitchenStation[] {
    return list.filter((s) => s.active);
  }

  protected since(at: string): string {
    return openFor(at);
  }

  protected printsHere(stationId: string): boolean {
    return this.printer.config()?.stationIds.includes(stationId) ?? false;
  }

  protected togglePrinter(stationId: string): void {
    const current = this.printer.config()?.stationIds ?? [];
    const next = current.includes(stationId) ? current.filter((s) => s !== stationId) : [...current, stationId];
    this.printer.configure(next.length > 0 ? { branchId: this.branchId(), stationIds: next } : null);
  }

  protected stationNames(ids: readonly string[]): string {
    const names = (this.stations() ?? []).filter((s) => ids.includes(s.id)).map((s) => s.name);
    return names.length === 0 ? 'comandas' : names.join(' y ');
  }

  protected setWidth(width: ReceiptWidth): void {
    this.width.set(width);
    saveReceiptWidth(width);
  }

  protected test(): void {
    void printComandas([{
      id: 'prueba', number: 0, branchId: '', tabId: '', tabLabel: 'Prueba de impresora', kind: 'TABLE', guests: null,
      notes: null, stationId: '', stationName: 'Cocina', sentAt: new Date().toISOString(), sentById: null, sentByName: null,
      status: 'NEW', printCount: 1, type: 'ORDER', voidOfNumber: null, preparingAt: null, readyAt: null, items: [{ id: 'i', name: 'Hamburguesa', quantity: 1, note: 'sin cebolla', voided: false,
        modifiers: [{ groupName: 'Término', name: 'Medio', quantity: 1, highlight: true }] }],
    }], this.width());
  }

  protected print(ticket: KitchenTicket): void {
    this.api.print(ticket.id).subscribe({
      next: (t) => {
        this.tickets.update((list) => (list ?? []).map((x) => (x.id === t.id ? t : x)));
        void printComandas([t], this.width());
      },
    });
  }
}
