import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { ButtonIconPos, ButtonSeverity, ButtonSize, buttonClasses, buttonIconClasses } from './button';

/**
 * Botón de la app (decisión 337, fase A2; reemplaza a `p-button` de PrimeNG con las mismas entradas).
 * Por dentro es un `<button>` nativo con `type="button"` por defecto (dentro de un formulario no lo envía si no se pide
 * `type="submit"`). Mientras `loading` está activo se desactiva y muestra tres puntos que saltan en lugar del ícono (dirección Orgánica).
 * `styleClass` va al `<button>`; `class` queda en el elemento `app-button`, como en PrimeNG.
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [attr.type]="type()" [attr.aria-label]="ariaLabel()" [disabled]="disabled() || loading()"
            [class]="buttonClass()" (click)="clicked.emit($event)">
      @if (loading()) {
        <span class="ui-button-icon ui-dots" aria-hidden="true"><i></i><i></i><i></i></span>
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
