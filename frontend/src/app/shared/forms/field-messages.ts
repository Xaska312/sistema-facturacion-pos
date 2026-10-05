import { AbstractControl, ValidationErrors } from '@angular/forms';
import { FieldProblem } from '../../core/errors/problem';

/** Clave del error que pone el servidor en un control (ProblemDetail con errores de campo). */
export const SERVER_ERROR = 'server';

/** Mensaje en español para los errores de un control; null si no hay. */
export function controlErrorMessage(errors: ValidationErrors | null, patternMessage?: string | null): string | null {
  if (!errors) {
    return null;
  }
  if (typeof errors[SERVER_ERROR] === 'string') {
    return errors[SERVER_ERROR] as string;
  }
  if (errors['required']) {
    return 'Este campo es obligatorio.';
  }
  if (errors['email']) {
    return 'Escribe un correo válido (ejemplo: nombre@correo.com).';
  }
  const minLength = errors['minlength'] as { requiredLength: number } | undefined;
  if (minLength) {
    return `Escribe al menos ${minLength.requiredLength} caracteres.`;
  }
  const maxLength = errors['maxlength'] as { requiredLength: number } | undefined;
  if (maxLength) {
    return `Máximo ${maxLength.requiredLength} caracteres.`;
  }
  const min = errors['min'] as { min: number } | undefined;
  if (min) {
    return `El valor mínimo es ${min.min}.`;
  }
  const max = errors['max'] as { max: number } | undefined;
  if (max) {
    return `El valor máximo es ${max.max}.`;
  }
  if (errors['pattern']) {
    return patternMessage ?? 'El formato no es válido.';
  }
  return 'Revisa este campo.';
}

/**
 * Pone los errores de campo del servidor en los controles del formulario con el mismo nombre
 * (se quitan solos cuando el usuario cambia el valor). Devuelve los que no corresponden a ningún control.
 */
export function applyServerErrors(form: AbstractControl | null, problems: readonly FieldProblem[]): FieldProblem[] {
  const unmatched: FieldProblem[] = [];
  for (const problem of problems) {
    const control = form?.get(problem.field) ?? null;
    if (control && control !== form) {
      control.setErrors({ ...(control.errors ?? {}), [SERVER_ERROR]: capitalize(problem.message) });
      control.markAsTouched();
    } else {
      unmatched.push(problem);
    }
  }
  return unmatched;
}

function capitalize(text: string): string {
  const trimmed = text.trim();
  const sentence = trimmed.charAt(0).toLocaleUpperCase('es-CO') + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
