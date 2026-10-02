import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AUTH_API, AuthService } from './auth.service';

/** Endpoints que no llevan Bearer ni disparan refresh ante un 401. */
const PUBLIC_AUTH_ENDPOINTS = ['/login', '/register', '/refresh', '/logout'].map((p) => AUTH_API + p);

function isPublicAuth(url: string): boolean {
  return PUBLIC_AUTH_ENDPOINTS.some((endpoint) => url.startsWith(endpoint));
}

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}

/**
 * Agrega el access token (en memoria) a las llamadas a la API. Ante un 401 intenta un único
 * refresh (compartido entre peticiones concurrentes), reintenta la petición y, si falla,
 * lleva al login.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || isPublicAuth(request.url)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(withToken(request, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        switchMap((renewed) => {
          if (!renewed) {
            void router.navigate(['/login']);
            return throwError(() => error);
          }
          return next(withToken(request, auth.accessToken()));
        }),
      );
    }),
  );
};
