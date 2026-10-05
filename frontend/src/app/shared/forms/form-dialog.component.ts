import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, input, model, output, signal, viewChild } from '@angular/core';
import { AbstractControl, FormArray, FormGroup } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { Observable } from 'rxjs';
import { InlineErrorScope } from '../../core/errors/inline-errors';
import { FieldProblem, fieldProblemText, problemFieldErrors, problemMessage } from '../../core/errors/problem';
import { ConfirmService } from '../confirm';
import { applyServerErrors } from './field-messages';

/**
 * Diálogo de formulario de la app:
 * - Guardar con Enter (submit del formulario) o con el botón; mientras guarda, el botón muestra un spinner y no se
 *   puede enviar dos veces.
 * - Errores del servidor junto a cada campo (ProblemDetail con errores de campo) o arriba del formulario; los 4xx no
 *   salen como toast.
 * - Esc o la X cierran; si hay cambios sin guardar, pide confirmación.
 *
 * Funciona con formularios reactivos ({@code [form]}, el contenido usa su propio {@code [formGroup]}) o con borradores
 * de ngModel ({@code [dirty]} e {@code [invalidMessage]}). El contenido NO debe tener su propio {@code <form>}.
 */
@Component({
  selector: 'app-form-dialog',
  imports: [DialogModule, ButtonModule],
  template: `
    <p-dialog [visible]="visible()" (visibleChange)="onVisibleChange($event)" [modal]="true" [header]="header()"
              [style]="{ width: width(), maxWidth: 'calc(100vw - 2rem)' }" [draggable]="false" [resizable]="false"
              [closeOnEscape]="false" [focusOnShow]="false" [blockScroll]="true" (onShow)="focusFirstField()"
              (keydown.escape)="requestClose()">
      <form #formElement novalidate class="flex flex-col gap-4" (submit)="onSubmit($event)">
        @if (description()) {
          <p class="text-sm text-muted -mt-1">{{ description() }}</p>
        }
        @if (formError(); as error) {
          <div class="rounded-lg bg-danger-soft text-danger-soft-fg text-sm px-3 py-2" role="alert">
            <p class="font-medium flex items-center gap-2">
              <i class="pi pi-exclamation-circle" aria-hidden="true"></i>{{ error }}
            </p>
            @if (otherProblems().length > 0) {
              <ul class="list-disc pl-6 mt-1">
                @for (problem of otherProblems(); track $index) {
                  <li>{{ problemText(problem) }}</li>
                }
              </ul>
            }
          </div>
        }

        <ng-content />

        <div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-line">
          <p-button type="button" label="Cancelar" [text]="true" severity="secondary" [disabled]="saving()"
                    (onClick)="requestClose()" />
          <p-button type="submit" [label]="submitLabel()" [icon]="submitIcon()" [loading]="saving()"
                    [severity]="destructive() ? 'danger' : null" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class FormDialogComponent {
  private readonly confirm = inject(ConfirmService);
  private readonly messages = inject(MessageService);
  private readonly inlineErrors = inject(InlineErrorScope);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('formElement');

  readonly visible = model(false);
  readonly header = input.required<string>();
  readonly description = input<string | null>(null);
  readonly width = input('32rem');
  readonly submitLabel = input('Guardar');
  readonly submitIcon = input('pi pi-check');
  /** Acción destructiva (p. ej. anular): botón rojo. */
  readonly destructive = input(false);
  /** Formulario reactivo (validación, cambios sin guardar y errores por campo). */
  readonly form = input<AbstractControl | null>(null);
  /** Para borradores con ngModel: hay cambios sin guardar. */
  readonly dirty = input(false);
  /** Para borradores con ngModel: motivo por el que aún no se puede guardar (null = se puede). */
  readonly invalidMessage = input<string | null>(null);
  /** Petición de guardado; se llama al enviar el formulario válido. */
  readonly save = input.required<() => Observable<unknown>>();
  /** Toast al guardar (null = sin toast). */
  readonly successMessage = input<string | null>('Cambios guardados');
  /** Se emite con la respuesta del servidor después de guardar y cerrar. */
  readonly saved = output<unknown>();

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly otherProblems = signal<FieldProblem[]>([]);

  protected readonly problemText = fieldProblemText;

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.saving()) {
      return;
    }
    this.formError.set(null);
    this.otherProblems.set([]);
    const form = this.form();
    if (form) {
      revalidate(form);
      if (form.invalid) {
        form.markAllAsTouched();
        this.formError.set('Revisa los campos marcados.');
        this.focusFirstInvalid();
        return;
      }
    }
    const blocked = this.invalidMessage();
    if (blocked) {
      this.formError.set(blocked);
      return;
    }
    this.saving.set(true);
    this.inlineErrors.run(this.save()()).subscribe({
      next: (result) => {
        this.saving.set(false);
        form?.markAsPristine();
        this.close();
        if (this.successMessage()) {
          this.messages.add({ severity: 'success', summary: this.successMessage() ?? '', life: 3000 });
        }
        this.saved.emit(result);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (!(error instanceof HttpErrorResponse) || error.status < 400 || error.status >= 500) {
          // Sin conexión o error del servidor: ya se mostró el toast global.
          return;
        }
        const problems = problemFieldErrors(error);
        const unmatched = applyServerErrors(form, problems);
        if (problems.length > 0) {
          this.formError.set(unmatched.length === problems.length ? 'Revisa los datos:' : 'Revisa los campos marcados.');
          this.otherProblems.set(unmatched);
          this.focusFirstInvalid();
        } else {
          this.formError.set(problemMessage(error));
        }
      },
    });
  }

  /** Esc, la X o "Cancelar": confirma si hay cambios sin guardar. */
  requestClose(): void {
    if (this.saving()) {
      return;
    }
    const dirty = (this.form()?.dirty ?? false) || this.dirty();
    if (!dirty) {
      this.close();
      return;
    }
    this.confirm.ask({
      header: 'Descartar cambios',
      message: 'Tienes cambios sin guardar. ¿Quieres descartarlos?',
      acceptLabel: 'Descartar cambios',
      rejectLabel: 'Seguir editando',
      danger: true,
      accept: () => this.close(),
    });
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.requestClose();
    }
  }

  protected focusFirstField(): void {
    const field = this.formElement()?.nativeElement.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
    );
    field?.focus();
  }

  private focusFirstInvalid(): void {
    setTimeout(() => {
      const field = this.formElement()?.nativeElement.querySelector<HTMLElement>(
        'input.ng-invalid, select.ng-invalid, textarea.ng-invalid',
      );
      field?.focus();
    });
  }

  private close(): void {
    this.formError.set(null);
    this.otherProblems.set([]);
    this.visible.set(false);
  }
}

/** Recalcula la validez de todos los controles (quita los errores del servidor de un intento anterior). */
function revalidate(control: AbstractControl): void {
  if (control instanceof FormGroup || control instanceof FormArray) {
    for (const child of Object.values(control.controls)) {
      revalidate(child);
    }
  }
  control.updateValueAndValidity({ onlySelf: true, emitEvent: false });
}
