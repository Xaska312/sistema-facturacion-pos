import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo del adicional Aska y de Aska, su asistente (decisión 358, antes 295 y 298): una burbuja de chat con la A
 * sin barra del nombre XASKA y el rombo ámbar del logo en el lugar de la barra. Plano como el logo de XASKA, con un
 * degradado ligero de índigo (sin brillo, aro ni halo). Colores de los tokens --xaska-ia-* (src/styles.css); no cambia
 * con el color de cada negocio. Con {@code wordmark}: "XASKA" y la etiqueta "IA" al lado.
 *
 * Con {@code label} se anuncia como imagen con ese nombre; sin él es decorativo.
 */
/** Cada logo usa su propio degradado (ids únicos en la página). */
let nextId = 0;

@Component({
  selector: 'app-xaska-ia-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span class="xia" [class.xia-sm]="size() === 'sm'" [class.xia-btn]="size() === 'btn'" [class.xia-lg]="size() === 'lg'" [class.xia-xl]="size() === 'xl'"
          [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null"
          [attr.aria-hidden]="label() ? null : 'true'">
      <svg viewBox="-6 -6 112 112" class="xia-icon" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient [attr.id]="ids.tile" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" class="stop-top" />
            <stop offset="1" class="stop-bottom" />
          </linearGradient>
        </defs>
        <path [attr.d]="bubble" [attr.fill]="'url(#' + ids.tile + ')'" />
        <g transform="translate(27.6 12) scale(0.8)">
          <polygon [attr.points]="lambda" class="ink" />
          <polygon points="28,36 36,45 28,54 20,45" class="spark" />
        </g>
      </svg>
      @if (wordmark()) {
        <span class="xia-name">XASKA</span>
        <span class="xia-tag">IA</span>
      }
    </span>
  `,
  styles: `
    .xia {
      --icon: 2.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      line-height: 1;
    }
    .xia-sm { --icon: 1.5rem; gap: 0.375rem; }
    .xia-btn { --icon: 1.75rem; gap: 0.5rem; }
    .xia-lg { --icon: 3.25rem; gap: 0.75rem; }
    .xia-xl { --icon: 3.5rem; gap: 0.75rem; }
    .xia-icon {
      width: var(--icon); height: var(--icon); flex-shrink: 0; overflow: visible;
      shape-rendering: geometricPrecision;
    }
    .stop-top { stop-color: var(--xaska-ia-tile-top); }
    .stop-bottom { stop-color: var(--xaska-ia-tile-bottom); }
    .ink { fill: var(--xaska-ia-ink); }
    .spark { fill: var(--xaska-ia-spark); }
    .xia-name {
      font-weight: 800;
      letter-spacing: -0.01em;
      font-size: calc(var(--icon) * 0.55);
    }
    .xia-tag {
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      padding: 0.1875rem 0.4375rem;
      border-radius: 9999px;
      background: var(--xaska-ia-tag-bg);
      color: var(--xaska-ia-tag-text);
    }
  `,
})
export class XaskaIaLogoComponent {
  /** "XASKA" y la etiqueta "IA" al lado del monograma. */
  readonly wordmark = input(false);
  /** sm 24 px, btn 28 px (dentro de botones), md 40 px, lg 52 px, xl 56 px. */
  readonly size = input<'sm' | 'btn' | 'md' | 'lg' | 'xl'>('md');
  /** Nombre accesible; vacío = decorativo (cuando el texto ya está cerca). */
  readonly label = input('');

  protected readonly ids = { tile: `xia-tile-${++nextId}` };
  /** Burbuja: cuadrado de esquinas 26 (como el de XASKA) con la cola abajo a la izquierda. */
  protected readonly bubble = 'M20 -6H80A26 26 0 0 1 106 20V66A26 26 0 0 1 80 92H20A26 26 0 0 1 -6 66V20A26 26 0 0 1 20 -6Z'
    + 'M30 86L0 106L6 86Z';
  protected readonly lambda = '6.4,72 28,16.6 49.6,72 62.4,72 34.4,0 21.6,0 -6.4,72';
}
