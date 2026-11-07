import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo del adicional XASKA IA y de Aska, su asistente (decisiones 295 y 298): el monograma "IA" dibujado con la A sin
 * barra del nombre XASKA y una chispa ámbar, sobre el índigo de la marca. Colores de los tokens --xaska-ia-* (src/styles.css); no cambia con el color de
 * cada negocio. Con {@code wordmark}: "XASKA" y la etiqueta "IA" al lado.
 *
 * Con {@code label} se anuncia como imagen con ese nombre; sin él es decorativo.
 */
@Component({
  selector: 'app-xaska-ia-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span class="xia" [class.xia-sm]="size() === 'sm'" [class.xia-lg]="size() === 'lg'" [class.xia-xl]="size() === 'xl'"
          [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null"
          [attr.aria-hidden]="label() ? null : 'true'">
      <svg viewBox="-6 -6 112 112" class="xia-icon" aria-hidden="true" focusable="false">
        <rect x="-6" y="-6" width="112" height="112" rx="26" class="tile" />
        <rect x="20" y="30" width="8" height="45" class="ink" />
        <polygon [attr.points]="lambda" class="ink" transform="translate(40 30) scale(0.62)" />
        <path [attr.d]="spark" class="spark" />
      </svg>
      @if (wordmark()) {
        <span class="xia-name">XASKA</span>
        <span class="xia-tag">IA</span>
      }
    </span>
  `,
  styles: `
    .xia {
      --icon: 2rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      line-height: 1;
    }
    .xia-sm { --icon: 1.25rem; gap: 0.375rem; }
    .xia-lg { --icon: 3rem; gap: 0.75rem; }
    .xia-xl { --icon: 3.5rem; gap: 0.75rem; }
    .xia-icon { width: var(--icon); height: var(--icon); flex-shrink: 0; }
    .tile { fill: var(--xaska-ia-tile); }
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
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  /** Nombre accesible; vacío = decorativo (cuando el texto ya está cerca). */
  readonly label = input('');

  protected readonly lambda = '6.4,72 28,16.6 49.6,72 62.4,72 34.4,0 21.6,0 -6.4,72';
  protected readonly spark = 'M80 10C81.6 18.4 81.6 18.4 90 20C81.6 21.6 81.6 21.6 80 30C78.4 21.6 78.4 21.6 70 20C78.4 18.4 '
    + '78.4 18.4 80 10Z';
}
