import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { problemMessage } from './problem';

/** Marca una petición cuyos errores 4xx maneja quien la hace (sin toast). */
export const SILENT_CLIENT_ERRORS = new HttpContextToken<boolean>(() => false);

/**
 * Muestra un toast con el ProblemDetail de cualquier error de la API, salvo los 401
 * (los maneja el interceptor de autenticación) y los 4xx de peticiones marcadas con {@link SILENT_CLIENT_ERRORS}.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messages = inject(MessageService);
  return next(request).pipe(
    catchError((error: unknown) => {
      const silent = error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500
        && request.context.get(SILENT_CLIENT_ERRORS);
      if (error instanceof HttpErrorResponse && error.status !== 401 && !silent) {
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
