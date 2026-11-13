import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { ButtonIconPos, ButtonSeverity, ButtonSize, buttonClasses, buttonIconClasses } from './button';

/**
 * Botón de la app (decisión 337, fase A2; reemplaza a `p-button` de PrimeNG con las mismas entradas).
 * Por dentro es un `<button>` nativo con `type="button"` por defecto (dentro de un formulario no lo envía si no se pide
 * `type="submit"`). Mientras `loading` está activo se desactiva y muestra el giro en lugar del ícono.
 * `styleClass` va al `<button>`; `class` queda en el elemento `app-button`, como en PrimeNG.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [attr.type]="type()" [attr.aria-label]="ariaLabel()" [disabled]="disabled() || loading()"
            [class]="buttonClass()" (click)="clicked.emit($event)">
      @if (loading()) {
        <svg class="ui-button-icon ui-button-spinner" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path fill="currentColor" [attr.d]="spinnerPath" />
        </svg>
      } @else if (icon()) {
        <span [class]="iconClass()" aria-hidden="true"></span>
      }
      @if (label()) {
        <span class="ui-button-label">{{ label() }}</span>
      }
    </button>
  `,
})
export class ButtonComponent {
  readonly label = input<string | null | undefined>(undefined);
  readonly icon = input<string | null | undefined>(undefined);
  readonly iconPos = input<ButtonIconPos>('left');
  readonly severity = input<ButtonSeverity>(undefined);
  readonly text = input(false, { transform: booleanAttribute });
  readonly outlined = input(false, { transform: booleanAttribute });
  readonly size = input<ButtonSize>(undefined);
  readonly rounded = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly ariaLabel = input<string | null | undefined>(undefined);
  readonly styleClass = input<string | null | undefined>(undefined);

  readonly clicked = output<MouseEvent>();

  protected readonly spinnerPath = SPINNER_PATH;

  protected readonly buttonClass = computed(() => {
    const base = buttonClasses({
      severity: this.severity(),
      text: this.text(),
      outlined: this.outlined(),
      size: this.size(),
      rounded: this.rounded(),
      iconOnly: (!!this.icon() || this.loading()) && !this.label(),
      loading: this.loading(),
    });
    const extra = this.styleClass();
    return extra ? `${base} ${extra}` : base;
  });

  protected readonly iconClass = computed(() => buttonIconClasses(this.icon() ?? '', this.iconPos(), !!this.label()));
}

/** Giro de "cargando" (mismo dibujo que usaba PrimeNG). */
const SPINNER_PATH =
  'M6.99701 14C5.85441 13.999 4.72939 13.7186 3.72012 13.1832C2.71084 12.6478 1.84795 11.8737 1.20673 10.9284C0.565504 ' +
  '9.98305 0.165424 8.89526 0.041387 7.75989C-0.0826496 6.62453 0.073125 5.47607 0.495122 4.4147C0.917119 3.35333 ' +
  '1.59252 2.4113 2.46241 1.67077C3.33229 0.930247 4.37024 0.413729 5.4857 0.166275C6.60117 -0.0811796 7.76026 ' +
  '-0.0520535 8.86188 0.251112C9.9635 0.554278 10.9742 1.12227 11.8057 1.90555C11.915 2.01493 11.9764 2.16319 11.9764 ' +
  '2.31778C11.9764 2.47236 11.915 2.62062 11.8057 2.73C11.7521 2.78503 11.688 2.82877 11.6171 2.85864C11.5463 2.8885 ' +
  '11.4702 2.90389 11.3933 2.90389C11.3165 2.90389 11.2404 2.8885 11.1695 2.85864C11.0987 2.82877 11.0346 2.78503 ' +
  '10.9809 2.73C9.9998 1.81273 8.73246 1.26138 7.39226 1.16876C6.05206 1.07615 4.72086 1.44794 3.62279 2.22152C2.52471 ' +
  '2.99511 1.72683 4.12325 1.36345 5.41602C1.00008 6.70879 1.09342 8.08723 1.62775 9.31926C2.16209 10.5513 3.10478 ' +
  '11.5617 4.29713 12.1803C5.48947 12.7989 6.85865 12.988 8.17414 12.7157C9.48963 12.4435 10.6711 11.7264 11.5196 ' +
  '10.6854C12.3681 9.64432 12.8319 8.34282 12.8328 7C12.8328 6.84529 12.8943 6.69692 13.0038 6.58752C13.1132 6.47812 ' +
  '13.2616 6.41667 13.4164 6.41667C13.5712 6.41667 13.7196 6.47812 13.8291 6.58752C13.9385 6.69692 14 6.84529 14 ' +
  '7C14 8.85651 13.2622 10.637 11.9489 11.9497C10.6356 13.2625 8.85432 14 6.99701 14Z';
