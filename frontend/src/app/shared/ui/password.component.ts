import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EmbeddedViewRef,
  OnDestroy,
  TemplateRef,
  ViewContainerRef,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ICON_EYE, ICON_EYE_SLASH } from './icons';
import { OVERLAY_Z_INDEX, attachToBody, clearZIndex, placeBelow, setZIndex } from './overlay';

const MEDIUM = /^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,})/;
const STRONG = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/;

type Strength = 'weak' | 'medium' | 'strong' | null;

/** Nivel de una contraseña con las mismas reglas que el medidor de PrimeNG. */
export function passwordStrength(value: string): Strength {
  if (STRONG.test(value)) {
    return 'strong';
  }
  if (MEDIUM.test(value)) {
    return 'medium';
  }
  return value.length ? 'weak' : null;
}

const LABELS: Record<Exclude<Strength, null>, string> = { weak: 'Débil', medium: 'Media', strong: 'Fuerte' };
const WIDTHS: Record<Exclude<Strength, null>, string> = { weak: '33.33%', medium: '66.66%', strong: '100%' };

/**
 * Campo de contraseña (decisión 340; reemplaza a `p-password` con las mismas entradas): ojo para mostrarla
 * (`toggleMask`, ahora un botón que se alcanza con el teclado) y, con `feedback`, el medidor de seguridad debajo mientras
 * se escribe (`promptLabel` antes de escribir; Débil, Media, Fuerte).
 */
@Component({
  selector: 'app-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordComponent), multi: true }],
  host: { '[class]': "'ui-password ' + (styleClass() ?? '')" },
  template: `
    <input [class]="'app-input ui-password-input ' + (inputStyleClass() ?? '')"
           [attr.type]="unmasked() ? 'text' : 'password'"
           [attr.autocomplete]="autocomplete()" [attr.placeholder]="placeholder()" [attr.id]="inputId()"
           [value]="value()" [disabled]="disabled()" [class.ui-password-has-toggle]="toggleMask()"
           (input)="onInput($any($event.target).value)" (focus)="onFocus()" (blur)="onBlur()"
           (keyup.escape)="hideMeter()" />
    @if (toggleMask()) {
      <button type="button" class="ui-password-toggle" [attr.aria-label]="unmasked() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              [attr.aria-pressed]="unmasked()" (mousedown)="$event.preventDefault()" (click)="unmasked.set(!unmasked())">
        <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" [attr.d]="unmasked() ? eyeSlash : eye" />
        </svg>
      </button>
    }
    <ng-template #meterTemplate>
      <div class="ui-password-overlay" aria-hidden="true">
        <div class="ui-password-content">
          <div class="ui-password-meter">
            <div [class]="'ui-password-meter-label ' + (strength() ? 'ui-password-meter-' + strength() : '')"
                 [style.width]="meterWidth()"></div>
          </div>
          <div class="ui-password-meter-text">{{ meterText() }}</div>
        </div>
      </div>
    </ng-template>
  `,
})
export class PasswordComponent implements ControlValueAccessor, OnDestroy {
  readonly toggleMask = input(false, { transform: booleanAttribute });
  readonly feedback = input(true, { transform: booleanAttribute });
  readonly promptLabel = input<string | null | undefined>(undefined);
  readonly autocomplete = input<string | null | undefined>(undefined);
  readonly placeholder = input<string | null | undefined>(undefined);
  readonly inputId = input<string | null | undefined>(undefined);
  readonly styleClass = input<string | null | undefined>(undefined);
  readonly inputStyleClass = input<string | null | undefined>(undefined);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly unmasked = signal(false);
  protected readonly eye = ICON_EYE;
  protected readonly eyeSlash = ICON_EYE_SLASH;
  protected readonly strength = computed(() => passwordStrength(this.value()));
  protected readonly meterWidth = computed(() => {
    const level = this.strength();
    return level ? WIDTHS[level] : '';
  });
  protected readonly meterText = computed(() => {
    const level = this.strength();
    return level ? LABELS[level] : (this.promptLabel() ?? 'Escribe una contraseña');
  });

  private readonly meterTemplate = viewChild.required<TemplateRef<unknown>>('meterTemplate');
  private readonly container = inject(ViewContainerRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private meter: EmbeddedViewRef<unknown> | null = null;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  ngOnDestroy(): void {
    this.hideMeter();
  }

  protected onInput(value: string): void {
    this.value.set(value);
    this.onChange(value);
    if (this.feedback() && !this.meter) {
      this.showMeter();
    }
  }

  protected onFocus(): void {
    if (this.feedback()) {
      this.showMeter();
    }
  }

  protected onBlur(): void {
    this.hideMeter();
    this.onTouched();
  }

  protected hideMeter(): void {
    if (this.meter) {
      const panel = this.meterPanel();
      if (panel) {
        clearZIndex(panel);
      }
      this.meter.destroy();
      this.meter = null;
    }
  }

  /** Debajo del campo y del mismo ancho, como el de PrimeNG. */
  private showMeter(): void {
    if (this.meter) {
      return;
    }
    this.meter = attachToBody(this.container, this.meterTemplate());
    const panel = this.meterPanel();
    if (panel) {
      panel.style.minWidth = `${this.host.nativeElement.offsetWidth}px`;
      setZIndex('overlay', panel, OVERLAY_Z_INDEX);
      placeBelow(panel, this.host.nativeElement, '2px', false);
    }
  }

  private meterPanel(): HTMLElement | null {
    return (this.meter?.rootNodes.find((n: Node) => n instanceof HTMLElement) as HTMLElement | undefined) ?? null;
  }
}
