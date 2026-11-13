import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input } from '@angular/core';
import { ButtonIconPos, ButtonSeverity, ButtonSize, buttonClasses, buttonIconClasses } from './button';

/**
 * Enlace con aspecto de botón (decisión 337, fase A2; reemplaza a `a[pButton]` de PrimeNG): `routerLink`, `href`,
 * `target` y demás siguen siendo del `<a>`. Mismas entradas visuales que `app-button`.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- se aplica sobre <a>, como el pButton de PrimeNG
  selector: 'a[appButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'hostClass()' },
  template: `
    @if (icon()) {
      <span [class]="iconClass()" aria-hidden="true"></span>
    }
    @if (label()) {
      <span class="ui-button-label">{{ label() }}</span>
    }
    <ng-content />
  `,
})
export class ButtonLinkComponent {
  readonly label = input<string | null | undefined>(undefined);
  readonly icon = input<string | null | undefined>(undefined);
  readonly iconPos = input<ButtonIconPos>('left');
  readonly severity = input<ButtonSeverity>(undefined);
  readonly text = input(false, { transform: booleanAttribute });
  readonly outlined = input(false, { transform: booleanAttribute });
  readonly size = input<ButtonSize>(undefined);
  readonly rounded = input(false, { transform: booleanAttribute });

  protected readonly hostClass = computed(() =>
    buttonClasses({
      severity: this.severity(),
      text: this.text(),
      outlined: this.outlined(),
      size: this.size(),
      rounded: this.rounded(),
      iconOnly: !!this.icon() && !this.label(),
      loading: false,
    }),
  );

  protected readonly iconClass = computed(() => buttonIconClasses(this.icon() ?? '', this.iconPos(), !!this.label()));
}
