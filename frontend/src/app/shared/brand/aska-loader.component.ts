import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { XaskaIaLogoComponent } from './xaska-ia-logo.component';

let loaderId = 0;

/**
 * Aska trabajando (decisión 301): el logo con un destello ámbar y lavanda que recorre su aro de luz, la chispa que
 * late y mensajes que cambian. Con movimiento reducido no se anima: queda el logo con el aro y el mensaje.
 */
@Component({
  selector: 'app-aska-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [XaskaIaLogoComponent],
  host: { class: 'flex flex-col items-center gap-3 py-4', role: 'status', 'aria-live': 'polite' },
  template: `
    <span class="aska-loader-stage" aria-hidden="true">
      <app-xaska-ia-logo size="lg" class="aska-loader-logo" />
      <svg viewBox="0 0 100 100" class="aska-loader-ring" focusable="false">
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" class="ring-from" />
            <stop offset="1" class="ring-to" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="94" height="94" rx="27" pathLength="100" class="ring-track" />
        <rect x="3" y="3" width="94" height="94" rx="27" pathLength="100" class="ring-comet"
              [attr.stroke]="'url(#' + gradientId + ')'" />
      </svg>
    </span>
    <span class="text-sm font-medium aska-loader-text">{{ current() }}</span>
    @if (hint()) {
      <span class="text-xs text-muted text-center max-w-xs">{{ hint() }}</span>
    }
  `,
  styles: `
    .aska-loader-stage { position: relative; display: grid; place-items: center; width: 5rem; height: 5rem; }
    .aska-loader-ring { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .ring-track { fill: none; stroke: var(--aska-line); stroke-width: 2; opacity: 0.55; }
    .ring-comet {
      fill: none; stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 26 74;
      animation: aska-orbit 1.6s linear infinite;
      filter: drop-shadow(0 0 4px var(--xaska-ia-spark-glow));
    }
    .ring-from { stop-color: var(--xaska-ia-spark); }
    .ring-to { stop-color: var(--xaska-dot-on-tile); }
    .aska-loader-text { color: var(--aska-soft-fg); }
    :host ::ng-deep .aska-loader-logo .spark { animation: aska-spark 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    @keyframes aska-orbit { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
    @keyframes aska-spark { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.45); } }
    @media (prefers-reduced-motion: reduce) {
      .ring-comet { animation: none; stroke-dasharray: none; opacity: 0.6; }
      :host ::ng-deep .aska-loader-logo .spark { animation: none; }
    }
  `,
})
export class AskaLoaderComponent implements OnInit {
  /** Mensajes que se turnan cada 2,2 s; el último se queda. */
  readonly messages = input<string[]>(['Aska está trabajando…']);
  readonly hint = input('');

  protected readonly current = signal('');
  protected readonly gradientId = `aska-loader-${++loaderId}`;
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const list = this.messages();
    let i = 0;
    this.current.set(list[0] ?? '');
    const timer = setInterval(() => {
      if (i < list.length - 1) {
        i += 1;
        this.current.set(list[i]);
      }
    }, 2200);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}
