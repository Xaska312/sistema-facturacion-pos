import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, switchMap, throwError } from 'rxjs';
import { AUTH_API, AuthService } from './auth.service';
import { decodeAccessToken } from './jwt';

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

function sameTenant(a: string, b: string): boolean {
  return (decodeAccessToken(a)?.tid ?? null) === (decodeAccessToken(b)?.tid ?? null);
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

  const sentToken = auth.accessToken();
  return next(withToken(request, sentToken)).pipe(
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
      // Otra petición ya renovó mientras esta viajaba: se repite con el token actual si es del mismo negocio.
      const current = auth.accessToken();
      if (current && sentToken && current !== sentToken) {
        if (sameTenant(current, sentToken)) {
          return next(withToken(request, current));
        }
        // El negocio cambió mientras esta petición viajaba: nunca se repite en el otro negocio (QA SEG-2).
        return throwError(() => error);
      }
      return auth.renew().pipe(
        switchMap((outcome) => {
          if (outcome === 'renewed') {
            return next(withToken(request, auth.accessToken()));
          }
          if (outcome === 'tenant-changed') {
            // Se eligió otro negocio en otra pestaña: no se repite (se guardaría en el negocio equivocado).
            messages.add({
              severity: 'warn',
              summary: 'Cambiaste de negocio en otra pestaña',
              detail: 'Esta pestaña ahora muestra ese negocio. Lo que ibas a guardar no se guardó: revísalo.',
              life: 10000,
            });
            void router.navigate([auth.hasTenant() ? '/app' : '/negocios']);
          } else if (outcome === 'unreachable') {
            messages.add({
              severity: 'error',
              summary: 'Sin conexión',
              detail: 'No pudimos renovar tu sesión. Revisa tu internet e inténtalo de nuevo.',
              life: 6000,
            });
          } else {
            void router.navigate(['/login']);
          }
          return throwError(() => error);
        }),
      );
    }),
  );
};
