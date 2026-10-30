import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { KitchenApi, KitchenStation, KitchenTicket, TicketStatus } from '../../core/api/kitchen.api';
import { problemMessage } from '../../core/errors/problem';
import { DiningEventsService } from '../../core/realtime/dining-events.service';
import { liveRefresh } from '../../core/realtime/live-refresh';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { formatQuantity } from '../../shared/money';
import { alarm, chime, unlockSound } from '../../shared/sound';
import { minutesSince, ticketStatusLabel, urgency } from './ticket-labels';

const STATIONS_KEY = 'pos.kitchenDisplay.stations';

function loadStations(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STATIONS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function saveStations(ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STATIONS_KEY, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento: se muestran todas las estaciones.
  }
}

/**
 * Pantalla de cocina (Fase 12b-4, decisión 271): para una tableta o un televisor en la cocina, legible a 2 m. Las
 * comandas pendientes en tarjetas grandes, la más vieja primero, con su tiempo (amarillo desde 10 min, rojo desde 20).
 * Un toque las pasa de Nueva a Preparando y a Lista (avisa a quien la envió); las Listas esperan a que el mesero las
 * entregue. Llegan al instante (con sonido) y lo anulado aparece tachado con alarma.
 */
@Component({
  selector: 'app-kitchen-display',
  imports: [ButtonModule, SkeletonModule, XIconComponent],
  template: `
    <div class="kds" [class.kds--full]="full()">
      <header class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="flex items-center gap-3">
          <app-xicon name="kitchen" [size]="34" />
          <div>
            <h1 class="text-3xl font-extrabold tracking-tight leading-tight">Cocina</h1>
            <p class="text-base font-semibold" [class.text-success]="live()" [class.text-warning]="!live()" role="status">
              {{ live() ? 'En vivo' : 'Reconectando… se actualiza cada 15 s' }}
              · {{ counts().fresh }} nuevas · {{ counts().cooking }} preparando · {{ counts().ready }} listas
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (!soundOn()) {
            <p-button label="Activar sonido" icon="pi pi-volume-up" (onClick)="enableSound()" />
          }
          <p-button [label]="full() ? 'Salir de pantalla completa' : 'Pantalla completa'" icon="pi pi-window-maximize"
                    severity="secondary" [outlined]="true" (onClick)="toggleFull()" />
        </div>
      </header>

      @if (stations().length > 1) {
        <nav class="flex gap-2 overflow-x-auto pb-3" aria-label="Estaciones que ve esta pantalla">
          <button type="button" class="chip" [attr.aria-pressed]="chosen().length === 0" (click)="chooseAll()">Todas</button>
          @for (s of stations(); track s.id) {
            <button type="button" class="chip" [attr.aria-pressed]="chosen().includes(s.id)" (click)="toggleStation(s.id)">
              {{ s.name }}
            </button>
          }
        </nav>
      }

      @if (alert(); as a) {
        <div class="alert" role="alert">
          <span><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ a }}</span>
          <p-button label="Entendido" severity="danger" (onClick)="alert.set(null)" />
        </div>
      }

      @if (tickets(); as list) {
        @if (list.length === 0) {
          <div class="empty">
            <app-xicon name="kitchen" [size]="64" />
            <p class="text-2xl font-bold mt-3">Todo al día</p>
            <p class="text-lg text-muted">Las comandas nuevas aparecen aquí al instante.</p>
          </div>
        } @else {
          <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Comandas pendientes">
            @for (t of list; track t.id) {
              <li class="ticket" [attr.data-status]="t.status" [attr.data-urgency]="t.status === 'READY' ? 'ok' : urgencyOf(t)"
                  [class.ticket--flash]="flashing().has(t.id)">
                <div class="ticket-head">
                  <div class="min-w-0">
                    <p class="text-lg font-bold">{{ t.stationName }} · #{{ t.number }}</p>
                    <h2 class="text-3xl font-extrabold leading-tight truncate">{{ t.tabLabel }}</h2>
                  </div>
                  <div class="text-right shrink-0">
                    <p class="text-3xl font-extrabold tabular-nums">{{ minutes(t) }}′</p>
                    <p class="text-sm font-bold uppercase">{{ statusLabel(t.status) }}</p>
                  </div>
                </div>
                <ul class="ticket-items" [attr.aria-label]="'Productos de la comanda ' + t.number">
                  @for (i of t.items; track i.id) {
                    <li [class.voided]="i.voided">
                      <p class="text-2xl font-extrabold leading-snug">
                        <span class="tabular-nums">{{ q(i.quantity) }}</span> {{ i.name }}
                        @if (i.voided) { <span class="void-badge">ANULADO</span> }
                      </p>
                      @for (m of i.modifiers; track $index) {
                        @if (m.highlight) {
                          <p class="highlight">{{ m.groupName }}: {{ m.name }}</p>
                        } @else {
                          <p class="text-xl font-semibold">+ {{ m.name }}{{ m.quantity > 1 ? ' ×' + m.quantity : '' }}</p>
                        }
                      }
                      @if (i.note) { <p class="text-xl font-bold italic">“{{ i.note }}”</p> }
                    </li>
                  }
                </ul>
                @if (t.notes) { <p class="text-lg font-semibold px-4 pb-2">Nota: {{ t.notes }}</p> }
                <div class="ticket-actions">
                  @switch (t.status) {
                    @case ('NEW') {
                      <button type="button" class="act" (click)="move(t, 'PREPARING')">Preparando</button>
                      <button type="button" class="act act--main" (click)="move(t, 'READY')">Lista</button>
                    }
                    @case ('PREPARING') {
                      <button type="button" class="act" (click)="move(t, 'NEW')">Deshacer</button>
                      <button type="button" class="act act--main" (click)="move(t, 'READY')">Lista</button>
                    }
                    @case ('READY') {
                      <button type="button" class="act" (click)="move(t, 'PREPARING')">Deshacer</button>
                      <button type="button" class="act act--main" (click)="move(t, 'DELIVERED')">Entregada</button>
                    }
                  }
                </div>
              </li>
            }
          </ul>
        }
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          @for (i of [0, 1, 2]; track i) {
            <p-skeleton height="16rem" borderRadius="1.25rem" />
          }
        </div>
      }
    </div>
  `,
  styles: `
    .kds { min-height: 100%; }
    .kds--full { position: fixed; inset: 0; z-index: 60; overflow: auto; padding: 1.25rem; background: var(--surface-ground); }
    .chip {
      min-height: 3rem;
      padding: 0 1.25rem;
      border-radius: 9999px;
      border: 2px solid var(--surface-border);
      background: var(--surface);
      font-size: 1.125rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .chip[aria-pressed='true'] { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
    .alert {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      border: 3px solid var(--danger);
      background: var(--danger-soft);
      color: var(--danger-soft-text);
      font-size: 1.5rem;
      font-weight: 800;
    }
    .empty { display: flex; flex-direction: column; align-items: center; padding: 4rem 1rem; text-align: center; }
    .ticket {
      display: flex;
      flex-direction: column;
      border-radius: 1.25rem;
      border: 3px solid var(--surface-border);
      background: var(--surface);
      box-shadow: var(--elevation-card);
      overflow: hidden;
    }
    .ticket-head {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--info-soft);
      color: var(--info-soft-text);
    }
    .ticket[data-status='PREPARING'] .ticket-head { background: var(--brand-soft); color: var(--brand-soft-text); }
    .ticket[data-status='READY'] { border-color: var(--success); }
    .ticket[data-status='READY'] .ticket-head { background: var(--success-soft); color: var(--success-soft-text); }
    .ticket[data-urgency='late'] { border-color: var(--warning); }
    .ticket[data-urgency='late'] .ticket-head { background: var(--warning-soft); color: var(--warning-soft-text); }
    .ticket[data-urgency='overdue'] { border-color: var(--danger); }
    .ticket[data-urgency='overdue'] .ticket-head { background: var(--danger-soft); color: var(--danger-soft-text); }
    .ticket--flash { animation: flash 1s ease-in-out 3; }
    @keyframes flash { 50% { box-shadow: 0 0 0 6px var(--focus-ring); } }
    @media (prefers-reduced-motion: reduce) { .ticket--flash { animation: none; outline: 4px solid var(--focus-ring); } }
    .ticket-items { flex: 1; padding: 0.5rem 1rem; }
    .ticket-items > li { padding: 0.5rem 0; border-bottom: 1px solid var(--surface-border); }
    .ticket-items > li:last-child { border-bottom: 0; }
    .voided p { text-decoration: line-through; opacity: 0.6; }
    .void-badge {
      display: inline-block;
      margin-left: 0.5rem;
      padding: 0 0.5rem;
      border-radius: 0.5rem;
      background: var(--danger);
      color: var(--brand-contrast);
      font-size: 1rem;
      text-decoration: none;
      vertical-align: middle;
    }
    .highlight {
      display: inline-block;
      margin: 0.25rem 0;
      padding: 0.125rem 0.625rem;
      border-radius: 0.5rem;
      background: var(--text);
      color: var(--surface);
      font-size: 1.375rem;
      font-weight: 800;
      text-transform: uppercase;
    }
    .ticket-actions { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--surface-border); }
    .act {
      flex: 1;
      min-height: 3.5rem;
      border-radius: 0.875rem;
      border: 2px solid var(--surface-border);
      background: var(--surface);
      font-size: 1.25rem;
      font-weight: 800;
    }
    .act--main { flex: 2; background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); }
    .act:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px; }
  `,
})
export class KitchenDisplayComponent implements OnInit {
  private readonly api = inject(KitchenApi);
  private readonly events = inject(DiningEventsService);
  private readonly messages = inject(MessageService);

  protected readonly stations = signal<KitchenStation[]>([]);
  protected readonly chosen = signal<string[]>(loadStations());
  protected readonly tickets = signal<KitchenTicket[] | null>(null);
  protected readonly flashing = signal<ReadonlySet<string>>(new Set());
  protected readonly alert = signal<string | null>(null);
  protected readonly soundOn = signal(false);
  protected readonly full = signal(false);
  protected readonly live = this.events.connected;
  protected readonly q = formatQuantity;
  protected readonly statusLabel = ticketStatusLabel;
  private readonly now = signal(new Date());

  protected readonly counts = computed(() => {
    const list = this.tickets() ?? [];
    return {
      fresh: list.filter((t) => t.status === 'NEW').length,
      cooking: list.filter((t) => t.status === 'PREPARING').length,
      ready: list.filter((t) => t.status === 'READY').length,
    };
  });

  constructor() {
    liveRefresh({ when: (e) => e.type !== 'TAB_CHANGED', load: () => this.load(), fallbackMs: 15_000, slowMs: 60_000 });
    // Sonido y resaltado: comanda nueva (ding) y anulación (alarma con aviso).
    this.events.events$.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (!this.mine(e.stationId)) {
        return;
      }
      if (e.type === 'TICKET_SENT') {
        this.ring(chime);
      } else if (e.type === 'ITEM_VOIDED') {
        this.ring(alarm);
        this.alert.set(`Anularon un producto de ${e.label ?? 'una cuenta'} (comanda #${e.number ?? ''}). No lo prepares.`);
        if (e.ticketId) {
          this.flash(e.ticketId);
        }
      }
    });
    const clock = setInterval(() => this.now.set(new Date()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(clock);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    });
  }

  ngOnInit(): void {
    this.api.stations().subscribe({
      next: (list) => {
        const active = list.filter((s) => s.active);
        this.stations.set(active);
        // Estaciones guardadas que ya no existen se olvidan.
        this.chosen.update((ids) => ids.filter((id) => active.some((s) => s.id === id)));
      },
      error: () => this.stations.set([]),
    });
    this.load();
  }

  protected load(): void {
    const before = new Set((this.tickets() ?? []).map((t) => t.id));
    this.api.board(null, this.chosen()).subscribe({
      next: (list) => {
        this.now.set(new Date());
        if (this.tickets() !== null) {
          list.filter((t) => !before.has(t.id)).forEach((t) => this.flash(t.id));
        }
        this.tickets.set(list);
      },
      error: () => this.tickets.update((t) => t ?? []),
    });
  }

  protected minutes(t: KitchenTicket): number {
    return minutesSince(t.sentAt, this.now());
  }

  protected urgencyOf(t: KitchenTicket): string {
    return urgency(t.sentAt, this.now());
  }

  protected move(ticket: KitchenTicket, status: TicketStatus): void {
    // Se ve de una vez; si el servidor no acepta, vuelve como estaba.
    const previous = this.tickets();
    this.tickets.update((list) => (list ?? [])
      .map((t) => (t.id === ticket.id ? { ...t, status } : t))
      .filter((t) => t.status !== 'DELIVERED'));
    this.api.setStatus(ticket.id, status).subscribe({
      error: (e: unknown) => {
        this.tickets.set(previous);
        this.messages.add({ severity: 'error', summary: 'No se cambió la comanda', detail: problemMessage(e) });
      },
    });
  }

  protected chooseAll(): void {
    this.chosen.set([]);
    saveStations([]);
    this.load();
  }

  protected toggleStation(id: string): void {
    const ids = this.chosen();
    const next = ids.includes(id) ? ids.filter((s) => s !== id) : [...ids, id];
    this.chosen.set(next);
    saveStations(next);
    this.load();
  }

  protected enableSound(): void {
    unlockSound();
    this.soundOn.set(true);
    chime();
  }

  protected toggleFull(): void {
    const next = !this.full();
    this.full.set(next);
    if (next && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    } else if (!next && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  private mine(stationId: string | null): boolean {
    const chosen = this.chosen();
    return chosen.length === 0 || stationId === null || chosen.includes(stationId);
  }

  private ring(sound: () => void): void {
    if (this.soundOn()) {
      sound();
    }
  }

  private flash(id: string): void {
    this.flashing.update((s) => new Set([...s, id]));
    setTimeout(() => this.flashing.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    }), 3500);
  }
}
