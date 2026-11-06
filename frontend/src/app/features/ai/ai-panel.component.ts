import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AiApi, AskTurn, AskUsage } from '../../core/api/ai.api';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { AnswerBlock, answerBlocks, suggestionsFor, usageText } from './ai-text';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  blocks: AnswerBlock[];
  consulted: string[];
}

/**
 * "Pregúntale a tu negocio" (XASKA IA, decisión 296): panel lateral que se abre desde la barra superior. La
 * conversación vive solo mientras el panel está abierto: al cerrarlo se borra (el servidor no la guarda).
 */
@Component({
  selector: 'app-ai-panel',
  imports: [FormsModule, ButtonModule, XaskaIaLogoComponent],
  template: `
    <div class="flex flex-col h-full gap-3">
      <div class="flex items-center gap-3">
        <app-xaska-ia-logo size="lg" />
        <div class="min-w-0">
          <p class="font-bold tracking-tight">Pregúntale a tu negocio</p>
          <p class="text-xs text-muted">Responde con tus reportes y solo con lo que tu usuario puede ver.</p>
        </div>
      </div>

      <div #scroller class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1" aria-live="polite">
        @if (messages().length === 0) {
          <div class="flex flex-col gap-2">
            <p class="text-sm text-muted">Prueba con:</p>
            @for (s of suggestions(); track s) {
              <button type="button" class="text-left text-sm rounded-xl border border-line px-3 py-2.5 min-h-11 hover:bg-surface-alt"
                      [disabled]="loading() || limitReached()" (click)="send(s)">{{ s }}</button>
            }
          </div>
        }
        @for (m of messages(); track $index) {
          @if (m.role === 'user') {
            <p class="self-end max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-sm bg-brand text-brand-contrast whitespace-pre-line">{{ m.text }}</p>
          } @else {
            <div class="self-start max-w-[92%] rounded-2xl rounded-bl-md px-3 py-2 text-sm bg-surface-alt flex flex-col gap-2">
              @for (b of m.blocks; track $index) {
                @if (b.kind === 'p') {
                  <p>{{ b.text }}</p>
                } @else {
                  <ul class="list-disc pl-5 flex flex-col gap-0.5">
                    @for (item of b.items; track $index) {
                      <li>{{ item }}</li>
                    }
                  </ul>
                }
              }
              @if (m.consulted.length > 0) {
                <p class="text-xs text-muted">Consultó: {{ m.consulted.join(', ') }}</p>
              }
            </div>
          }
        }
        @if (loading()) {
          <p class="self-start text-sm text-muted flex items-center gap-2" role="status">
            <span class="pi pi-spin pi-spinner" aria-hidden="true"></span>Revisando tus datos…
          </p>
        }
      </div>

      <form class="flex flex-col gap-2" (ngSubmit)="send()">
        <label for="ai-question" class="sr-only">Tu pregunta</label>
        <textarea id="ai-question" name="question" rows="2" maxlength="500" [(ngModel)]="question"
                  class="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm resize-none"
                  placeholder="Escribe tu pregunta…" [disabled]="limitReached()"
                  (keydown.enter)="onEnter($event)"></textarea>
        <div class="flex items-center gap-2">
          <span class="flex-1 text-xs" [class.text-muted]="!limitReached()" [class.text-warning]="limitReached()">
            {{ usageLine() }}</span>
          @if (messages().length > 0) {
            <p-button type="button" label="Nueva" [text]="true" size="small" [disabled]="loading()" (onClick)="reset()" />
          }
          <p-button type="submit" label="Preguntar" icon="pi pi-send" size="small" [loading]="loading()"
                    [disabled]="!question.trim() || limitReached()" />
        </div>
        <p class="text-xs text-muted">Respuestas con IA a partir de tus reportes: revisa las cifras importantes. No
          cambia nada en tu negocio.</p>
      </form>
    </div>
  `,
})
export class AiPanelComponent implements OnInit {
  private readonly api = inject(AiApi);
  private readonly auth = inject(AuthService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly messages = signal<Message[]>([]);
  protected readonly loading = signal(false);
  protected readonly usage = signal<AskUsage | null>(null);
  protected question = '';

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

  ngOnInit(): void {
    this.api.usage().subscribe({ next: (u) => this.usage.set(u), error: () => this.usage.set(null) });
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
    const history: AskTurn[] = this.messages().map((m) => ({ role: m.role, text: m.text }));
    this.messages.update((list) => [...list, { role: 'user', text: q, blocks: [], consulted: [] }]);
    this.question = '';
    this.loading.set(true);
    this.scrollDown();
    this.api.ask(q, history).subscribe({
      next: (a) => {
        this.loading.set(false);
        this.usage.set(a.usage);
        this.messages.update((list) => [...list,
          { role: 'assistant', text: a.answer, blocks: answerBlocks(a.answer), consulted: a.consulted }]);
        this.scrollDown();
      },
      error: () => {
        this.loading.set(false);
        // La pregunta vuelve al cuadro para intentar de nuevo; el aviso del error sale arriba.
        this.messages.update((list) => list.slice(0, -1));
        this.question = q;
      },
    });
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
