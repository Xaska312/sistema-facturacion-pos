import { Component, DestroyRef, NgZone, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { WaConversation, WaDetail, WaRating, WaState, WaStatus, WhatsAppApi } from '../../core/api/whatsapp.api';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { ButtonComponent } from '../../shared/ui/button.component';
import { AppInputDirective } from '../../shared/ui/input.directive';
import { formatDateTime, formatRelative } from '../../shared/format';
import { WA_AUTHOR_LABEL, WA_STATUS_LABEL, waContact, waKind, waLead, waName, waRatingLine, waStateWarning, waWindowNote } from './whatsapp-text';

/**
 * Conversaciones del agente de WhatsApp de XASKA (decisión 362): quién escribió, qué respondió el asistente y las que
 * pasaron a una persona. Desde aquí se responde (dentro de las 24 horas), se devuelve al asistente o se cierra.
 */
@Component({
  selector: 'app-platform-whatsapp',
  imports: [FormsModule, PageHeaderComponent, ButtonComponent, AppInputDirective],
  template: `
    <app-page-header title="WhatsApp"
                     description="Lo que le escriben a XASKA por WhatsApp y por el chat de xaska.co: responde Aska y te avisa cuando alguien necesita a una persona." />

    @if (warning(); as w) {
      <p class="mb-4 rounded-2xl px-4 py-3 text-sm bg-warning-soft text-warning-soft-fg" role="status">{{ w }}</p>
    }

    <div class="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <section class="flex-col gap-3 lg:flex" [class.flex]="selected() === null" [class.hidden]="selected() !== null" aria-label="Conversaciones">
        <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar conversaciones">
          @for (f of filters; track f.label) {
            <button type="button" role="tab" class="wa-filter" [class.wa-filter--on]="filter() === f.value"
                    [attr.aria-selected]="filter() === f.value" (click)="setFilter(f.value)">{{ f.label }}</button>
          }
        </div>
        @if (conversations().length === 0 && !loading()) {
          <p class="text-sm text-muted px-1 py-6 text-center">No hay conversaciones con este filtro.</p>
        }
        <ul class="flex flex-col gap-2">
          @for (c of conversations(); track c.id) {
            <li>
              <button type="button" class="wa-item" [class.wa-item--on]="selected()?.conversation?.id === c.id"
                      (click)="open(c.id)">
                <span class="flex items-center justify-between gap-2">
                  <strong class="truncate">{{ name(c) }}</strong>
                  <span class="text-xs text-muted shrink-0">{{ relative(c.updatedAt) }}</span>
                </span>
                <span class="flex items-center gap-2 text-xs">
                  @if (c.channel === 'WEB') {
                    <span class="wa-chip wa-chip--web">Web</span>
                  }
                  <span class="wa-chip" [class.wa-chip--human]="c.status === 'HUMAN'" [class.wa-chip--closed]="c.status === 'CLOSED'">
                    {{ statusLabel[c.status] }}
                  </span>
                  @if (kind(c.customerKind); as k) {
                    <span class="wa-chip wa-chip--kind">{{ k }}</span>
                  }
                  @if (c.lastScore !== null) {
                    <span class="wa-score" [class.wa-score--low]="c.lastScore <= 3"
                          [attr.aria-label]="'Calificación ' + c.lastScore + ' de 5'">★ {{ c.lastScore }}</span>
                  }
                  @if (lead(c); as l) {
                    <span class="truncate text-muted">{{ l }}</span>
                  }
                </span>
                @if (c.lastMessage) {
                  <span class="text-sm text-muted truncate">{{ c.lastMessage }}</span>
                }
              </button>
            </li>
          }
        </ul>
      </section>

      <section class="wa-panel lg:flex" [class.hidden]="selected() === null" aria-label="Conversación">
        @if (selected(); as d) {
          <header class="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
            <div class="flex flex-col gap-0.5 min-w-0">
              <button type="button" class="text-sm text-muted self-start lg:hidden" (click)="close()">← Conversaciones</button>
              <h2 class="text-lg font-bold truncate">{{ name(d.conversation) }}</h2>
              <span class="text-sm text-muted">
                {{ contact(d.conversation) }} · {{ statusLabel[d.conversation.status] }}
                @if (kind(d.conversation.customerKind); as k) { · {{ k }} }
              </span>
              @if (lead(d.conversation); as l) {
                <span class="text-sm">{{ l }}</span>
              }
              @if (d.conversation.status === 'HUMAN' && d.conversation.handoffReason) {
                <span class="text-sm text-warning">Pasó a una persona: {{ d.conversation.handoffReason }}</span>
              }
              @for (r of d.ratings; track r.id) {
                <span class="text-sm" [class.text-warning]="r.score !== null && r.score <= 3">{{ ratingLine(r) }}</span>
              }
            </div>
            <div class="flex flex-wrap gap-2">
              @if (d.conversation.status !== 'HUMAN') {
                <app-button label="Tomarla yo" severity="secondary" size="small" [loading]="busy()" (clicked)="act('take')" />
              }
              @if (d.conversation.status !== 'BOT') {
                <app-button label="Devolver a Aska" severity="secondary" size="small" [loading]="busy()" (clicked)="act('bot')" />
              }
              @if (d.conversation.status !== 'CLOSED') {
                <app-button label="Cerrar y pedir calificación" severity="secondary" size="small" [text]="true" [loading]="busy()"
                            (clicked)="act('close')" />
              }
            </div>
          </header>

          <ol class="flex flex-col gap-2 py-4 overflow-y-auto" aria-live="polite">
            @for (m of d.messages; track m.id) {
              <li class="wa-msg" [class.wa-msg--out]="m.author !== 'CUSTOMER'" [class.wa-msg--human]="m.author === 'HUMAN'">
                <span class="text-xs text-muted">{{ authorLabel[m.author] }} · {{ when(m.createdAt) }}</span>
                <span class="whitespace-pre-line">{{ m.body }}</span>
              </li>
            }
          </ol>

          <form class="flex flex-col gap-2 border-t border-line pt-3" (ngSubmit)="send()">
            @if (d.conversation.channel === 'WEB') {
              <p class="text-sm text-muted">Le aparece en el chat de xaska.co si sigue en la página o cuando vuelva.</p>
            }
            @if (!d.windowOpen) {
              <p class="text-sm text-muted">{{ windowNote(d.conversation) }}</p>
            }
            <label class="sr-only" for="wa-reply">Tu respuesta</label>
            <textarea appInput id="wa-reply" name="reply" rows="3" maxlength="2000" [(ngModel)]="draft"
                      [disabled]="!d.windowOpen || busy()" placeholder="Escribe tu respuesta…"></textarea>
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-muted">Al responder, Aska deja de contestar en esta conversación.</span>
              <app-button type="submit" label="Enviar" [loading]="busy()" [disabled]="!d.windowOpen || !draft.trim()" />
            </div>
          </form>
        } @else {
          <p class="m-auto text-sm text-muted py-10">Elige una conversación.</p>
        }
      </section>
    </div>
  `,
  styles: `
    .wa-filter { padding: 0.375rem 0.875rem; border-radius: 9999px; font-size: 0.8125rem; font-weight: 600;
      border: 1px solid var(--line); color: var(--muted); background: var(--surface); }
    .wa-filter--on { background: var(--brand-soft); color: var(--brand-soft-fg); border-color: transparent; }
    .wa-item { width: 100%; display: flex; flex-direction: column; gap: 0.25rem; text-align: left; padding: 0.75rem 0.875rem;
      border-radius: 1rem; border: 1px solid var(--line); background: var(--surface); }
    .wa-item--on { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
    .wa-chip { padding: 0.125rem 0.5rem; border-radius: 9999px; background: var(--success-soft); color: var(--success-soft-fg); font-weight: 600; }
    .wa-chip--human { background: var(--warning-soft); color: var(--warning-soft-fg); }
    .wa-chip--web { background: var(--info-soft); color: var(--info-soft-fg); }
    .wa-chip--closed { background: var(--surface-alt); color: var(--muted); }
    .wa-chip--kind { background: var(--surface-alt); color: var(--text); }
    .wa-score { font-weight: 700; color: var(--success-soft-fg); }
    .wa-score--low { color: var(--warning-soft-fg); }
    .wa-panel { flex-direction: column; min-height: 28rem; max-height: calc(100dvh - 12rem); padding: 1rem; border-radius: 1.25rem;
      border: 1px solid var(--line); background: var(--surface); }
    .wa-panel:not(.hidden) { display: flex; }
    .wa-msg { display: flex; flex-direction: column; gap: 0.125rem; max-width: 85%; padding: 0.5rem 0.75rem;
      border-radius: 1rem; background: var(--surface-alt); align-self: flex-start; font-size: 0.9375rem; }
    .wa-msg--out { align-self: flex-end; background: var(--brand-soft); color: var(--brand-soft-fg); }
    .wa-msg--human { background: var(--info-soft); color: var(--info-soft-fg); }
  `,
})
export class PlatformWhatsAppComponent implements OnInit {
  private readonly api = inject(WhatsAppApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

  protected readonly filters: { label: string; value: WaStatus | null }[] = [
    { label: 'Todas', value: null },
    { label: 'Con una persona', value: 'HUMAN' },
    { label: 'Con Aska', value: 'BOT' },
    { label: 'Cerradas', value: 'CLOSED' },
  ];
  protected readonly statusLabel = WA_STATUS_LABEL;
  protected readonly authorLabel = WA_AUTHOR_LABEL;
  protected readonly filter = signal<WaStatus | null>(null);
  protected readonly conversations = signal<WaConversation[]>([]);
  protected readonly selected = signal<WaDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly state = signal<WaState | null>(null);
  protected readonly warning = computed(() => {
    const s = this.state();
    return s ? waStateWarning(s) : null;
  });
  protected draft = '';

  ngOnInit(): void {
    this.api.state().subscribe((s) => this.state.set(s));
    this.loadList();
    const id = this.route.snapshot.queryParamMap.get('c');
    if (id) {
      this.open(id);
    }
    // Llegan mensajes nuevos: la lista y la conversación abierta se refrescan solas.
    // Fuera de la zona de Angular: un temporizador eterno no debe dejar la página "ocupada" (pruebas, estabilidad).
    const timer = this.zone.runOutsideAngular(() => setInterval(() => this.zone.run(() => this.refresh()), 15000));
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected setFilter(value: WaStatus | null): void {
    this.filter.set(value);
    this.loadList();
  }

  protected open(id: string): void {
    this.api.detail(id).subscribe((d) => {
      this.selected.set(d);
      this.draft = '';
      void this.router.navigate([], { queryParams: { c: id }, replaceUrl: true });
    });
  }

  protected close(): void {
    this.selected.set(null);
    void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  protected send(): void {
    const d = this.selected();
    const text = this.draft.trim();
    if (!d || !text || !d.windowOpen) {
      return;
    }
    this.busy.set(true);
    this.api.reply(d.conversation.id, text).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.draft = '';
        this.selected.set(updated);
        this.loadList();
      },
      error: () => this.busy.set(false),
    });
  }

  protected act(action: 'take' | 'bot' | 'close'): void {
    const d = this.selected();
    if (!d) {
      return;
    }
    this.busy.set(true);
    this.api.action(d.conversation.id, action).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.selected.set(updated);
        this.loadList();
      },
      error: () => this.busy.set(false),
    });
  }

  protected name(c: WaConversation): string {
    return waName(c);
  }

  protected contact(c: WaConversation): string {
    return waContact(c);
  }

  protected lead(c: WaConversation): string {
    return waLead(c);
  }

  protected kind(k: WaConversation['customerKind']): string | null {
    return waKind(k);
  }

  protected windowNote(c: WaConversation): string {
    return waWindowNote(c);
  }

  protected ratingLine(r: WaRating): string {
    return waRatingLine(r);
  }

  protected when(value: string): string {
    return formatDateTime(value);
  }

  protected relative(value: string): string {
    return formatRelative(value);
  }

  private loadList(): void {
    this.api.conversations(this.filter()).subscribe({
      next: (list) => {
        this.conversations.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private refresh(): void {
    this.loadList();
    const d = this.selected();
    if (d && !this.busy() && !this.draft) {
      this.api.detail(d.conversation.id).subscribe((fresh) => this.selected.set(fresh));
    }
  }
}
