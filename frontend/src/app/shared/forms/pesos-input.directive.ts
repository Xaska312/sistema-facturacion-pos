import { Directive, ElementRef, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatPesosInput, parsePesos } from './pesos-input';

/**
 * Campo de pesos: `<input appPesos [(ngModel)]="monto">` o con `formControlName`. Acepta "250.000", "$ 1.500" o
 * "1.234,56", entrega un número (o null) y, al salir del campo, lo muestra con puntos de miles. `appPesos="2"`
 * permite centavos (precios y costos); sin valor, solo pesos enteros (pagos, base, conteo y movimientos de caja).
 */
@Directive({
  selector: 'input[appPesos]',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PesosInputDirective), multi: true }],
  host: {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    '(input)': 'handleInput()',
    '(blur)': 'handleBlur()',
  },
})
export class PesosInputDirective implements ControlValueAccessor {
  /** Decimales permitidos (por defecto 0). */
  readonly appPesos = input(0, { transform: (value: unknown) => Number(value) || 0 });

  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: unknown): void {
    this.element.value = typeof value === 'number' ? formatPesosInput(value, this.appPesos()) : '';
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.element.disabled = disabled;
  }

  protected handleInput(): void {
    this.onChange(parsePesos(this.element.value, this.appPesos()));
  }

  protected handleBlur(): void {
    this.onTouched();
    const value = parsePesos(this.element.value, this.appPesos());
    if (value !== null) {
      this.element.value = formatPesosInput(value, this.appPesos());
    }
  }
}
