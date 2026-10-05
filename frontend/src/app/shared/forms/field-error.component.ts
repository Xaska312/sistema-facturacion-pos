import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { SERVER_ERROR, controlErrorMessage } from './field-messages';

/**
 * Mensaje de error bajo un campo de formulario reactivo. Aparece cuando el campo se tocó o cambió, o si el servidor
 * lo rechazó: {@code <app-field-error [control]="form.controls.name" />}.
 */
@Component({
  selector: 'app-field-error',
  template: `
    @if (message(); as text) {
      <small class="flex items-center gap-1 text-danger text-xs" role="alert">
        <i class="pi pi-exclamation-circle text-[11px]" aria-hidden="true"></i>{{ text }}
      </small>
    }
  `,
})
export class FieldErrorComponent {
  readonly control = input.required<AbstractControl>();
  /** Texto para el error de formato (Validators.pattern). */
  readonly patternMessage = input<string | null>(null);

  protected message(): string | null {
    const control = this.control();
    const visible = control.invalid && (control.touched || control.dirty || control.hasError(SERVER_ERROR));
    return visible ? controlErrorMessage(control.errors, this.patternMessage()) : null;
  }
}
