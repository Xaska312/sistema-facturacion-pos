import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, switchMap, throwError } from 'rxjs';
import { AUTH_API, AuthService } from './auth.service';

/** 403 del backend cuando el negocio del token fue suspendido o cerrado (TenantUnavailableException). */
export const TENANT_UNAVAILABLE = 'TENANT_UNAVAILABLE';

export function isTenantUnavailable(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403
    && (error.error as { code?: unknown } | null)?.code === TENANT_UNAVAILABLE;
}

/** Endpoints que no llevan Bearer ni disparan refresh ante un 401 (ojo: verify-email/resend sí lleva sesión). */
const PUBLIC_AUTH_ENDPOINTS = [
  '/login',
  '/register',
  '/refresh',
  '/logout',
  '/verify-email',
  '/password-reset/request',
  '/password-reset/confirm',
].map((p) => AUTH_API + p);

export function isPublicAuth(url: string): boolean {
  const path = url.split('?')[0];
  return PUBLIC_AUTH_ENDPOINTS.includes(path);
}

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}

/**
 * Agrega el access token (en memoria) a las llamadas a la API. Ante un 401 intenta un único
 * refresh (compartido entre peticiones concurrentes), reintenta la petición y, si falla,
 * lleva al login. Si el negocio fue suspendido o cerrado, cierra la sesión una sola vez y lleva al login (en vez
 * de mostrar el error en cada pantalla).
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/api/') || isPublicAuth(request.url)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  const messages = inject(MessageService);

  return next(withToken(request, auth.accessToken())).pipe(
    catchError((error: unknown) => {
      if (isTenantUnavailable(error)) {
        if (auth.isAuthenticated()) {
          auth.clear();
          messages.add({
            severity: 'warn',
            summary: 'El negocio no está disponible',
            detail: 'Fue suspendido o eliminado. Inicia sesión de nuevo para ver tus negocios.',
            life: 8000,
          });
          void router.navigate(['/login']);
        }
        return throwError(() => error);
      }
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
