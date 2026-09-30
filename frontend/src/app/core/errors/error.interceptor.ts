import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { problemMessage } from './problem';

/**
 * Muestra un toast con el ProblemDetail de cualquier error de la API, salvo los 401
 * (los maneja el interceptor de autenticación).
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messages = inject(MessageService);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status !== 401) {
        messages.add({
          severity: error.status >= 500 || error.status === 0 ? 'error' : 'warn',
          summary: (error.error as { title?: string } | null)?.title ?? 'Error',
          detail: problemMessage(error),
          life: 5000,
        });
      }
      return throwError(() => error);
    }),
  );
};
