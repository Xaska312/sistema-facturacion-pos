import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo de XASKA, la empresa que hace el POS: el ícono (cuatro flechas que llegan a un punto, el punto de venta) y, si
 * se pide, el nombre dibujado a medida con la etiqueta "POS". Los colores salen de los tokens --xaska-* de
 * src/styles.css (claro y oscuro) y no cambian con el color de cada negocio: el logo del negocio va aparte
 * (Ajustes → Marca). Los archivos del logo para imprimir o redes están fuera del repo (paquete xaska-logo.zip).
 *
 * Con {@code label} el conjunto se anuncia como una imagen con ese nombre; sin él es decorativo.
 */
@Component({
  selector: 'app-xaska-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <span class="xaska" [class.xaska-lg]="size() === 'lg'" [class.xaska-stacked]="stacked()"
          [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null"
          [attr.aria-hidden]="label() ? null : 'true'">
      <svg viewBox="-6 -6 112 112" class="xaska-icon" aria-hidden="true" focusable="false">
        <rect x="-6" y="-6" width="112" height="112" rx="26" class="tile" />
        <g class="on-tile">
          <polygon [attr.points]="chevron" />
          <polygon [attr.points]="chevron" transform="rotate(90 50 50)" />
          <polygon [attr.points]="chevron" transform="rotate(180 50 50)" />
          <polygon [attr.points]="chevron" transform="rotate(270 50 50)" />
        </g>
        <polygon points="50,40 60,50 50,60 40,50" class="dot-on-tile" />
      </svg>
      @if (wordmark()) {
        <span class="xaska-wordmark-row">
        <svg viewBox="-0.5 -0.5 379 73" class="xaska-name" aria-hidden="true" focusable="false">
          <g class="ink">
            <polygon points="0,0 23,29.6 31.6,21 15.2,0" />
            <polygon points="39.6,51 56,72 71.2,72 48.2,42.4" />
            <polygon points="56,0 39.6,21 48.2,29.6 71.2,0" />
            <polygon points="23,42.4 0,72 15.2,72 31.6,51" />
            <polygon [attr.points]="lambda" transform="translate(91.6 0)" />
            <path transform="translate(168 0)"
                  d="M50 0H23A21 21 0 0 0 23 42H27A9 9 0 0 1 27 60H0V72H27A21 21 0 0 0 27 30H23A9 9 0 0 1 23 12H50Z" />
            <g transform="translate(232 0)">
              <polygon points="0,0 0,72 12,72 12,0" />
              <polygon points="13.8,40.6 63.5,0 44.5,0 6.2,31.4" />
              <polygon points="6.2,40.6 44.5,72 63.5,72 13.8,31.4" />
            </g>
            <polygon [attr.points]="lambda" transform="translate(315.9 0)" />
          </g>
          <polygon points="35.6,25 46.6,36 35.6,47 24.6,36" class="dot" />
        </svg>
        @if (tag()) {
          <span class="xaska-tag">POS</span>
        }
        </span>
      }
    </span>
  `,
  styles: `
    .xaska {
      --icon: 2rem;
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
      line-height: 1;
    }
    .xaska-lg {
      --icon: 3rem;
      gap: 0.875rem;
    }
    .xaska-icon {
      width: var(--icon);
      height: var(--icon);
      flex-shrink: 0;
    }
    .xaska-name {
      height: calc(var(--icon) * 0.5);
      width: auto;
      aspect-ratio: 379 / 73;
      flex-shrink: 0;
    }
    .tile { fill: var(--xaska-tile); }
    .on-tile { fill: var(--xaska-on-tile); }
    .dot-on-tile { fill: var(--xaska-dot-on-tile); }
    .ink { fill: var(--xaska-ink); }
    .dot { fill: var(--xaska-dot); }
    .xaska-tag {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      padding: 0.1875rem 0.4375rem;
      border-radius: 9999px;
      background: var(--xaska-tag-bg);
      color: var(--xaska-tag-text);
    }
    /* En fila, el nombre y la etiqueta siguen siendo hijos directos del flex (mismo espacio que antes). */
    .xaska-wordmark-row {
      display: contents;
    }
    /* Apilado (entrada): el símbolo arriba y centrado, y debajo el nombre con la etiqueta POS. */
    .xaska-stacked {
      --icon: 4.5rem;
      flex-direction: column;
      gap: 0.75rem;
    }
    .xaska-stacked .xaska-name {
      height: 1.75rem;
    }
    .xaska-stacked .xaska-wordmark-row {
      display: inline-flex;
      align-items: center;
      gap: 0.625rem;
    }
    .xaska-lg .xaska-tag {
      font-size: 0.8125rem;
      padding: 0.25rem 0.5rem;
    }
  `,
})
export class XaskaLogoComponent {
  /** Muestra el nombre XASKA al lado del ícono. */
  readonly wordmark = input(false);
  /** Agrega la etiqueta "POS" después del nombre. */
  readonly tag = input(false);
  readonly size = input<'md' | 'lg'>('md');
  /** El símbolo arriba y centrado, con el nombre debajo (pantalla de entrada). */
  readonly stacked = input(false);
  /** Nombre accesible; vacío = decorativo (cuando el texto ya está cerca). */
  readonly label = input('');

  protected readonly chevron = '28.2,14 50,35.8 71.8,14 56.2,14 50,20.2 43.8,14';
  protected readonly lambda = '6.4,72 28,16.6 49.6,72 62.4,72 34.4,0 21.6,0 -6.4,72';
}
