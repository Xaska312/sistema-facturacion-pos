import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AskaMoments } from '../../core/api/ai.api';
import { BillingApi } from '../../core/api/billing.api';
import { AuthService } from '../../core/auth/auth.service';
import { XaskaIaLogoComponent } from '../../shared/brand/xaska-ia-logo.component';
import { AskaMoment, dismissNudge, nudgeHidden } from './aska-nudge';
import { AskaMomentsState } from './aska-moments-state';

/**
 * Aska en el momento del dolor (decisión 308): un aviso suave cuando alguien hace a mano lo que Aska hace con una
 * foto. Con XASKA IA ofrece hacerlo ({@code act}); sin ella, la prueba gratis al dueño o "pídeselo al dueño" al resto.
 * Se cierra con "Ahora no" (la pantalla decide no volver a mostrarlo en ese trabajo) o "No volver a mostrar".
 */
@Component({
  selector: 'app-aska-nudge',
  imports: [RouterLink, XaskaIaLogoComponent],
  template: `
    @if (visible(); as m) {
      <aside class="nudge" role="note" [attr.aria-label]="'Aska: ' + title()">
        <app-xaska-ia-logo size="md" />
        <div class="flex-1 min-w-56">
          <p class="nudge-title">{{ title() }}</p>
          <p class="nudge-text">{{ m.hasAi ? withAi() : withoutAi() }}</p>
          @if (!m.hasAi && !m.canBuy) {
            <p class="nudge-muted">Pídele al dueño del negocio que active XASKA IA.</p>
          }
        </div>
        <div class="nudge-actions">
          @if (m.hasAi) {
            <button type="button" class="nudge-cta" (click)="act.emit()">{{ action() }}</button>
          } @else if (m.canBuy) {
            @if (m.trialAvailable) {
              <button type="button" class="nudge-cta" [disabled]="starting()" (click)="startTrial()">
                {{ starting() ? 'Activando…' : 'Probar gratis 14 días' }}</button>
            } @else {
              <a routerLink="/app/planes" class="nudge-cta">Ver XASKA IA</a>
            }
          }
          <div class="flex gap-3">
            <button type="button" class="nudge-link" (click)="close(false)">Ahora no</button>
            <button type="button" class="nudge-link" (click)="close(true)">No volver a mostrar</button>
          </div>
        </div>
      </aside>
    }
  `,
  styles: `
    :host { display: block; }
    .nudge {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.875rem; padding: 0.875rem 1rem;
      border-radius: 1rem; background: var(--aska-soft); border: 1px solid var(--aska-line);
      animation: nudge-in 0.3s ease-out;
    }
    .nudge-title { font-weight: 800; letter-spacing: -0.01em; color: var(--aska-soft-fg); }
    .nudge-text { font-size: 0.875rem; margin-top: 0.125rem; }
    .nudge-muted { font-size: 0.75rem; margin-top: 0.25rem; color: var(--text-muted); }
    .nudge-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 0.375rem; }
    .nudge-cta {
      display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; border-radius: 0.75rem;
      font-weight: 700; font-size: 0.875rem; color: var(--aska-contrast);
      background: linear-gradient(135deg, var(--aska-cta-from), var(--aska-cta-to));
    }
    .nudge-cta:disabled { opacity: 0.7; }
    .nudge-link { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-decoration: underline; min-height: 2rem; }
    @keyframes nudge-in { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .nudge { animation: none; } }
    @media (max-width: 639px) {
      .nudge-actions { width: 100%; align-items: stretch; }
      .nudge-cta { justify-content: center; }
    }
  `,
})
export class AskaNudgeComponent implements OnInit {
  private readonly state = inject(AskaMomentsState);
  private readonly billing = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly moment = input.required<AskaMoment>();
  /** Con XASKA IA, si quien mira puede usar aquí lo que Aska ofrece (permiso y cupo del mes). */
  readonly available = input(true);
  readonly title = input.required<string>();
  readonly withAi = input.required<string>();
  readonly withoutAi = input.required<string>();
  readonly action = input.required<string>();
  readonly act = output<void>();
  /** Se cerró: la pantalla no lo vuelve a mostrar en este trabajo. */
  readonly closed = output<void>();
  /** Activó la prueba gratis: la pantalla puede recargar lo que depende de XASKA IA. */
  readonly trialStarted = output<void>();

  private readonly moments = signal<AskaMoments | null>(null);
  private readonly dismissed = signal(false);
  protected readonly starting = signal(false);
  protected readonly visible = computed(() => {
    const m = this.moments();
    if (m === null || this.dismissed() || nudgeHidden(this.moment())) {
      return null;
    }
    return !m.hasAi || this.available() ? m : null;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.state.moments().subscribe((m) => this.moments.set(m));
  }

  protected close(forever: boolean): void {
    dismissNudge(this.moment(), forever);
    this.dismissed.set(true);
    this.closed.emit();
  }

  protected startTrial(): void {
    this.starting.set(true);
    this.billing.startAiTrial().subscribe({
      next: () => this.auth.renew().subscribe(() => {
        this.starting.set(false);
        this.state.refresh();
        this.load();
        this.messages.add({ severity: 'success', summary: 'XASKA IA activa por 14 días',
          detail: 'Listo: ya puedo ayudarte con esto.', life: 6000 });
        this.trialStarted.emit();
      }),
      error: () => this.starting.set(false),
    });
  }
}
