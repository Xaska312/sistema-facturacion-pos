import { Component, computed, effect, ElementRef, HostListener, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { AiApi, AskTurn, AskUsage } from '../../core/api/ai.api';
import { problemMessage } from '../../core/errors/problem';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { XIconComponent } from '../../shared/icons/xicon.component';
import { ParsedAnswer, firstName, parseAnswer, suggestionsFor, usageText } from './ai-text';
import { AskaState } from './aska-state';

interface Message {
  /** {@code problem}: Aska no pudo responder (se muestra en el panel, no se manda en el historial). */
  role: 'user' | 'assistant' | 'problem';
  text: string;
  parsed: ParsedAnswer | null;
  consulted: string[];
}

/**
 * Aska, la IA de XASKA (decisiones 296 y 298): botón flotante abajo a la derecha (encima del dock en el celular) que
 * abre una tarjeta flotante (pantalla completa en el celular). Colores de XASKA (--aska-*), no los del negocio. La
 * conversación vive solo mientras está abierta: al cerrarla se borra (el servidor no la guarda).
 */
@Component({
  selector: 'app-aska',
  imports: [FormsModule, RouterLink, XaskaIaLogoComponent, XIconComponent],
  template: `
    @if (!open()) {
      <button type="button" class="aska-fab" aria-haspopup="dialog" aria-label="Pregúntale a Aska, la IA de tu negocio"
              (click)="show()">
        <app-xaska-ia-logo size="xl" />
        <span class="aska-fab-label" aria-hidden="true">Pregúntale a <strong>Aska</strong></span>
      </button>
    } @else {
      <div class="aska-backdrop" aria-hidden="true" (click)="close()"></div>
      <section class="aska-panel" role="dialog" aria-modal="true" aria-labelledby="aska-title">
        <header class="aska-head">
          <span class="aska-orb" aria-hidden="true"></span>
          <div class="relative flex items-center gap-3">
            <app-xaska-ia-logo size="lg" />
            <div class="flex flex-col min-w-0">
              <h2 id="aska-title" class="aska-name">Aska</h2>
              <span class="aska-sub">Tu negocio responde · XASKA IA</span>
            </div>
            <button type="button" class="aska-close" aria-label="Cerrar Aska" (click)="close()">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          </div>
          <nav class="relative flex gap-1.5 mt-4" aria-label="Funciones de Aska">
            <span class="aska-tab aska-tab--on" aria-current="page">Preguntar</span>
            @if (canBuy()) {
              <a class="aska-tab" routerLink="/app/compras/que-comprar" (click)="close()">Qué comprar</a>
            }
          </nav>
        </header>

        <div #scroller class="aska-body" aria-live="polite">
          @if (messages().length === 0) {
            <div class="flex flex-col gap-4">
              <p class="aska-hello">Hola{{ name() ? ', ' + name() : '' }}.
                <span>¿Qué quieres saber de tu negocio?</span></p>
              <div class="flex flex-col gap-2">
                @for (s of suggestions(); track s.text) {
                  <button type="button" class="aska-chip" [disabled]="loading() || limitReached()" (click)="send(s.text)">
                    <app-xicon [name]="s.icon" [size]="20" />
                    <span>{{ s.text }}</span>
                  </button>
                }
              </div>
              <p class="text-xs text-muted">Aska responde con tus ventas, inventario, fiados y compras, y solo con lo que tu
                usuario puede ver.</p>
            </div>
          }
          @for (m of messages(); track $index; let last = $last) {
            @if (m.role === 'user') {
              <p class="aska-me">{{ m.text }}</p>
            } @else if (m.role === 'problem') {
              <div class="flex gap-2 items-start" role="alert">
                <app-xaska-ia-logo size="sm" />
                <div class="aska-problem">
                  <p>{{ m.text }}</p>
                  <button type="button" class="aska-follow self-start" [disabled]="loading() || limitReached()"
                          (click)="retry()">Intentar de nuevo</button>
                </div>
              </div>
            } @else if (m.parsed !== null) {
              @let a = m.parsed!;
              <div class="flex gap-2 items-start">
                <app-xaska-ia-logo size="sm" />
                <div class="aska-it">
                  @for (b of a.blocks; track $index) {
                    @if (b.kind === 'p') {
                      <p>@for (part of b.parts; track $index) {<span [class.aska-strong]="part.strong">{{ part.text }}</span>}</p>
                    } @else {
                      <ul class="list-disc pl-5 flex flex-col gap-0.5">
                        @for (item of b.items; track $index) {
                          <li>@for (part of item; track $index) {<span [class.aska-strong]="part.strong">{{ part.text }}</span>}</li>
                        }
                      </ul>
                    }
                  }
                  @if (a.figures.length > 0) {
                    <div class="grid grid-cols-2 gap-2">
                      @for (f of a.figures; track $index) {
                        <div class="aska-figure">
                          <span class="aska-figure-label">{{ f.label }}</span>
                          <span class="aska-figure-value">{{ f.value }}</span>
                        </div>
                      }
                    </div>
                  }
                  @if (m.consulted.length > 0) {
                    <span class="aska-consulted"><span class="aska-spark" aria-hidden="true"></span>Consultó: {{ m.consulted.join(' · ') }}</span>
                  }
                </div>
              </div>
              @if (last && a.followUps.length > 0 && !loading()) {
                <div class="flex flex-wrap gap-2 pl-8">
                  @for (f of a.followUps; track f) {
                    <button type="button" class="aska-follow" [disabled]="limitReached()" (click)="send(f)">{{ f }}</button>
                  }
                </div>
              }
            }
          }
          @if (loading()) {
            <div class="flex gap-2 items-center" role="status">
              <app-xaska-ia-logo size="sm" />
              <span class="aska-typing" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="text-xs text-muted">Aska está revisando tus datos…</span>
            </div>
          }
        </div>

        <form class="aska-foot" (ngSubmit)="send()">
          <div class="aska-input">
            <label for="aska-question" class="sr-only">Tu pregunta para Aska</label>
            <textarea #input id="aska-question" name="question" rows="1" maxlength="500" [(ngModel)]="question"
                      placeholder="Pregúntale a Aska…" [disabled]="limitReached()" (keydown.enter)="onEnter($event)"></textarea>
            <button type="submit" class="aska-send" aria-label="Enviar pregunta"
                    [disabled]="!question.trim() || loading() || limitReached()">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M12 3C12.9 9.2 14.8 11.1 21 12C14.8 12.9 12.9 14.8 12 21C11.1 14.8 9.2 12.9 3 12C9.2 11.1 11.1 9.2 12 3Z" />
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between gap-2 text-xs">
            <span [class.text-muted]="!limitReached()" [class.text-warning]="limitReached()">{{ usageLine() }}</span>
            @if (messages().length > 0) {
              <button type="button" class="text-xs font-semibold aska-link" [disabled]="loading()" (click)="reset()">Nueva conversación</button>
            } @else {
              <span class="text-muted">Solo consulta: no cambia nada</span>
            }
          </div>
        </form>
      </section>
    }
  `,
  styles: `
    :host { display: contents; }
    .aska-fab {
      position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 45;
      display: flex; align-items: center; gap: 0.75rem; flex-direction: row-reverse;
      padding: 0; border: 0; background: transparent; cursor: pointer;
    }
    /* El logo ya trae su aro y su sombra: el botón solo suma una luz dorada que respira y crece al pasar el mouse. */
    .aska-fab app-xaska-ia-logo {
      border-radius: 1rem; transition: transform 160ms ease, filter 160ms ease;
      filter: drop-shadow(0 12px 20px var(--aska-shadow)) drop-shadow(0 0 14px var(--xaska-ia-halo));
      animation: aska-halo 3.2s ease-in-out infinite;
    }
    .aska-fab:hover app-xaska-ia-logo, .aska-fab:focus-visible app-xaska-ia-logo {
      transform: translateY(-2px) scale(1.05); animation: none;
      filter: drop-shadow(0 14px 24px var(--aska-shadow)) drop-shadow(0 0 22px var(--xaska-ia-halo-strong));
    }
    .aska-fab:focus-visible { outline: none; }
    .aska-fab:focus-visible app-xaska-ia-logo { box-shadow: 0 0 0 3px var(--surface), 0 0 0 6px var(--aska-amber); }
    .aska-fab-label {
      padding: 0.625rem 0.875rem; border-radius: 0.875rem; font-size: 0.8125rem; font-weight: 600; white-space: nowrap;
      background: var(--xaska-panel); color: var(--xaska-panel-fg); box-shadow: var(--elevation-overlay);
      opacity: 0; transform: translateX(0.5rem); pointer-events: none; transition: opacity 160ms, transform 160ms;
    }
    .aska-fab-label strong { color: var(--aska-amber); }
    .aska-fab:hover .aska-fab-label, .aska-fab:focus-visible .aska-fab-label { opacity: 1; transform: none; }
    @keyframes aska-halo {
      0%, 100% { filter: drop-shadow(0 12px 20px var(--aska-shadow)) drop-shadow(0 0 12px var(--xaska-ia-halo)); }
      50% { filter: drop-shadow(0 12px 20px var(--aska-shadow)) drop-shadow(0 0 22px var(--xaska-ia-halo-strong)); }
    }
    @media (prefers-reduced-motion: reduce) { .aska-fab app-xaska-ia-logo { animation: none; } }

    .aska-backdrop { position: fixed; inset: 0; z-index: 46; background: var(--aska-backdrop); }
    .aska-panel {
      position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 47;
      width: min(26.5rem, calc(100vw - 2rem)); height: min(42rem, calc(100dvh - 3rem));
      display: flex; flex-direction: column; overflow: hidden; border-radius: 1.625rem;
      background: var(--surface); border: 1px solid var(--aska-line); box-shadow: 0 30px 80px var(--aska-shadow);
      animation: aska-in 180ms ease-out;
    }
    @keyframes aska-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } }
    .aska-head {
      position: relative; overflow: hidden; padding: 1.25rem 1.25rem 1rem;
      background: linear-gradient(160deg, var(--xaska-panel), var(--xaska-panel-2)); color: var(--xaska-panel-fg);
    }
    .aska-orb {
      position: absolute; right: -3rem; top: -4rem; width: 13rem; height: 13rem; border-radius: 9999px;
      background: var(--xaska-panel-tile); border: 1px solid var(--xaska-panel-line);
    }
    .aska-name { margin: 0; font-size: 1.5rem; line-height: 1; font-weight: 800; letter-spacing: -0.02em; }
    .aska-sub { margin-top: 0.25rem; font-size: 0.75rem; color: var(--xaska-panel-muted); }
    .aska-close {
      margin-left: auto; width: 2.5rem; height: 2.5rem; border-radius: 0.75rem; flex-shrink: 0;
      border: 1px solid var(--xaska-panel-line); background: transparent; color: var(--xaska-panel-fg);
    }
    .aska-close:hover { background: var(--xaska-panel-tile); }
    .aska-tab {
      display: inline-flex; align-items: center; min-height: 2rem; padding: 0 0.75rem; border-radius: 9999px;
      font-size: 0.75rem; font-weight: 600; color: var(--xaska-panel-muted);
    }
    a.aska-tab:hover { background: var(--xaska-panel-tile); color: var(--xaska-panel-fg); }
    .aska-tab--on { background: var(--xaska-panel-tile); color: var(--xaska-panel-fg); font-weight: 700; }

    .aska-body {
      flex: 1; min-height: 0; overflow-y: auto; padding: 1.125rem; display: flex; flex-direction: column; gap: 0.75rem;
      background: var(--surface-alt);
    }
    .aska-hello { margin: 0; font-size: 1.375rem; line-height: 1.2; font-weight: 800; letter-spacing: -0.02em; }
    .aska-hello span { display: block; color: var(--aska); }
    .aska-chip {
      display: flex; align-items: center; gap: 0.75rem; min-height: 3rem; padding: 0.5rem 0.875rem; text-align: left;
      border-radius: 0.875rem; border: 1px solid var(--surface-border); background: var(--surface);
      font-size: 0.875rem; font-weight: 600; transition: border-color 120ms, transform 120ms;
    }
    .aska-chip:hover:not(:disabled) { border-color: var(--aska-line); transform: translateX(2px); }
    .aska-me {
      align-self: flex-end; max-width: 82%; margin: 0; padding: 0.625rem 0.875rem; white-space: pre-line;
      border-radius: 1.125rem 1.125rem 0.375rem 1.125rem; background: var(--aska); color: var(--aska-contrast);
      font-size: 0.875rem;
    }
    .aska-it {
      max-width: 100%; display: flex; flex-direction: column; gap: 0.625rem; padding: 0.875rem;
      border-radius: 1.125rem 1.125rem 1.125rem 0.375rem; background: var(--surface); border: 1px solid var(--surface-border);
      font-size: 0.875rem; line-height: 1.55;
    }
    .aska-strong { color: var(--aska-soft-fg); font-weight: 800; }
    .aska-figure { display: flex; flex-direction: column; gap: 0.125rem; padding: 0.625rem; border-radius: 0.75rem; background: var(--aska-soft); }
    .aska-figure-label { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--aska-soft-fg); }
    .aska-figure-value { font-size: 1.0625rem; font-weight: 800; }
    .aska-consulted { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.6875rem; color: var(--text-muted); }
    .aska-spark { width: 0.5rem; height: 0.5rem; border-radius: 0.125rem; transform: rotate(45deg); background: var(--aska-amber); }
    .aska-follow {
      min-height: 2.25rem; padding: 0.375rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;
      border: 1px solid var(--aska-line); background: var(--surface); color: var(--aska-soft-fg);
    }
    .aska-follow:hover:not(:disabled) { background: var(--aska-soft); }
    .aska-problem {
      display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 0.875rem; font-size: 0.875rem;
      border-radius: 1.125rem 1.125rem 1.125rem 0.375rem; background: var(--warning-soft); color: var(--warning-soft-text);
    }
    .aska-typing { display: inline-flex; gap: 0.25rem; }
    .aska-typing i { width: 0.375rem; height: 0.375rem; border-radius: 9999px; background: var(--aska); animation: aska-dot 1s infinite; }
    .aska-typing i:nth-child(2) { animation-delay: 0.15s; }
    .aska-typing i:nth-child(3) { animation-delay: 0.3s; }
    @keyframes aska-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

    .aska-foot { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.875rem; border-top: 1px solid var(--surface-border); background: var(--surface); }
    .aska-input {
      display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.375rem 0.375rem 0.375rem 1rem; border-radius: 1.5rem;
      border: 1.5px solid var(--aska-line); background: var(--surface);
    }
    .aska-input:focus-within { border-color: var(--aska); }
    .aska-input textarea {
      flex: 1; min-height: 2.5rem; max-height: 7rem; padding: 0.5rem 0; resize: none; border: 0; outline: none;
      background: transparent; color: inherit; font: inherit; font-size: 0.9375rem;
    }
    .aska-send {
      width: 2.5rem; height: 2.5rem; border-radius: 9999px; border: 0; flex-shrink: 0; display: flex; align-items: center;
      justify-content: center; background: var(--aska); fill: var(--aska-amber);
    }
    .aska-send:disabled { opacity: 0.45; }
    .aska-link { color: var(--aska-soft-fg); }

    @media (max-width: 1023px) {
      .aska-fab { right: 1rem; bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 5.25rem); }
      .aska-fab-label { display: none; }
    }
    @media (max-width: 639px) {
      .aska-panel { inset: 0; width: 100vw; height: 100dvh; border-radius: 0; border: 0; }
      .aska-backdrop { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .aska-typing i, .aska-panel { animation: none; }
    }
  `,
})
export class AskaComponent {
  private readonly api = inject(AiApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly state = inject(AskaState);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');

  protected readonly open = signal(false);
  /** El último pedido de abrir que ya se atendió. */
  private handledRequest = 0;
  protected readonly messages = signal<Message[]>([]);
  protected readonly loading = signal(false);
  protected readonly usage = signal<AskUsage | null>(null);
  protected question = '';
  private lastQuestion = '';

  protected readonly name = computed(() => firstName(this.auth.user()?.fullName));
  protected readonly canBuy = computed(() => this.auth.permissions().has('purchases:read'));
  protected readonly suggestions = computed(() => {
    const permissions = this.auth.permissions();
    return suggestionsFor((p) => permissions.has(p));
  });
  protected readonly limitReached = computed(() => {
    const u = this.usage();
    return u !== null && u.used >= u.limit;
  });
  protected readonly usageLine = computed(() => {
    const u = this.usage();
    return u ? usageText(u.used, u.limit) : '';
  });

  constructor() {
    // Otra pantalla pidió abrir a Aska. Solo reacciona a pedidos nuevos (no a cerrar el panel): antes, al cerrar,
    // el pedido viejo la volvía a abrir y no había forma de salir.
    effect(() => {
      const request = this.state.openRequests();
      if (request > this.handledRequest) {
        this.handledRequest = request;
        untracked(() => {
          if (!this.open()) {
            this.show();
          }
          const q = this.state.takeQuestion();
          if (q) {
            this.send(q);
          }
        });
      }
    });
    // Un enlace con ?aska=pregunta (las preguntas del correo del Resumen del día, decisión 307) la abre y pregunta.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((e) => {
      if (e instanceof NavigationEnd) {
        this.fromLink(e.urlAfterRedirects);
      }
    });
    queueMicrotask(() => this.fromLink(this.router.url));
    // Al abrir: el cursor en la pregunta.
    effect(() => {
      const el = this.input()?.nativeElement;
      if (el && this.open()) {
        setTimeout(() => el.focus());
      }
    });
  }

  private fromLink(url: string): void {
    const q = this.router.parseUrl(url).queryParams['aska'];
    if (typeof q !== 'string' || !q.trim()) {
      return;
    }
    void this.router.navigate([], { queryParams: { aska: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (q === this.linkQuestion) {
      return;
    }
    this.linkQuestion = q;
    this.state.open(q);
  }

  /** La última pregunta que llegó por enlace, para no hacerla dos veces mientras se limpia la dirección. */
  private linkQuestion: string | null = null;

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.close();
    }
  }

  show(): void {
    this.open.set(true);
    this.api.usage().subscribe({ next: (u) => this.usage.set(u), error: () => this.usage.set(null) });
  }

  /** Cerrar borra la conversación (decisión 296). */
  close(): void {
    this.open.set(false);
    this.reset();
  }

  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (!keyboard.shiftKey) {
      keyboard.preventDefault();
      this.send();
    }
  }

  send(text?: string): void {
    const q = (text ?? this.question).trim();
    if (!q || this.loading() || this.limitReached()) {
      return;
    }
    // Lo que no se pudo responder sale de la conversación (la pregunta y el aviso).
    const kept = this.messages().filter((m, i, all) => m.role !== 'problem' && all[i + 1]?.role !== 'problem');
    const history: AskTurn[] = kept.map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
    this.messages.set([...kept, { role: 'user', text: q, parsed: null, consulted: [] }]);
    this.question = '';
    this.loading.set(true);
    this.scrollDown();
    this.api.ask(q, history).subscribe({
      next: (a) => {
        this.loading.set(false);
        this.usage.set(a.usage);
        this.messages.update((list) => [...list,
          { role: 'assistant', text: a.answer, parsed: parseAnswer(a.answer), consulted: a.consulted }]);
        this.scrollDown();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        const text = error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500
          ? problemMessage(error)
          : 'No me pude conectar. Revisa el internet e intenta de nuevo.';
        this.messages.update((list) => [...list, { role: 'problem', text, parsed: null, consulted: [] }]);
        this.lastQuestion = q;
        this.scrollDown();
      },
    });
  }

  /** Vuelve a hacer la pregunta que no se pudo responder. */
  protected retry(): void {
    if (this.lastQuestion) {
      this.send(this.lastQuestion);
    }
  }

  reset(): void {
    this.messages.set([]);
    this.question = '';
  }

  private scrollDown(): void {
    setTimeout(() => {
      const el = this.scroller()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
