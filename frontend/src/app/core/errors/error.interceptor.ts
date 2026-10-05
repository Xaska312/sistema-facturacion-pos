import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { InlineErrorScope } from './inline-errors';
import { problemMessage, problemTitle } from './problem';

/** Marca una petición cuyos errores 4xx maneja quien la hace (sin toast). */
export const SILENT_CLIENT_ERRORS = new HttpContextToken<boolean>(() => false);

/**
 * Muestra un toast con el ProblemDetail de cualquier error de la API, salvo los 401 (los maneja el interceptor de
 * autenticación) y los 4xx de peticiones marcadas con {@link SILENT_CLIENT_ERRORS} o hechas desde un formulario que
 * muestra sus errores en línea ({@link InlineErrorScope}).
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messages = inject(MessageService);
  const inline = inject(InlineErrorScope);
  return next(request).pipe(
    catchError((error: unknown) => {
      const clientError = error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500;
      const silent = clientError && (request.context.get(SILENT_CLIENT_ERRORS) || inline.active);
      if (error instanceof HttpErrorResponse && error.status !== 401 && !silent) {
        messages.add({
          severity: error.status >= 500 || error.status === 0 ? 'error' : 'warn',
          summary: problemTitle(error),
          detail: problemMessage(error),
          life: 6000,
        });
      }
      return throwError(() => error);
    }),
  );
};
