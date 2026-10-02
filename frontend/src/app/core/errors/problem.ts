import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '../api/api.models';

/** Mensaje legible en español a partir de un error HTTP (ProblemDetail del backend). */
export function problemMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No hay conexión con el servidor.';
    }
    const problem = error.error as (ProblemDetail & { properties?: Pick<ProblemDetail, 'errors'> }) | null;
    const errors = problem?.errors ?? problem?.properties?.errors;
    if (errors?.length) {
      return errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
    }
    if (problem?.detail) {
      return problem.detail;
    }
  }
  return 'Ocurrió un error inesperado.';
}
