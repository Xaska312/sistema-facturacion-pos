import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AUTH_API, AuthService } from '../auth/auth.service';
import { returnQuery } from '../auth/return-url';
import { SILENT_ALL_ERRORS } from '../errors/error.interceptor';

export interface LegalStatus {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
}

/**
 * ¿La persona ya aceptó los Términos y la Política vigentes? (decisión 250). Se pregunta una vez por usuario; si el
 * servidor sube la versión, la próxima carga de la app vuelve a preguntar.
 */
@Injectable({ providedIn: 'root' })
export class LegalService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  /**
   * Usuario que ya aceptó las versiones vigentes en esta carga de la app, o al que no se le pudo preguntar (sin red):
   * no se le vuelve a preguntar en cada pantalla hasta recargar.
   */
  private readonly acceptedBy = signal<string | null>(null);

  /** true si ya aceptó (o si no se pudo consultar: un fallo de red no bloquea la app). */
  isAccepted(): Observable<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId || this.acceptedBy() === userId) {
      return of(true);
    }
    // Consulta de fondo: si falla no sale ningún aviso (la app sigue y se vuelve a preguntar al recargar).
    const context = new HttpContext().set(SILENT_ALL_ERRORS, true);
    return this.http.get<LegalStatus>(`${AUTH_API}/legal`, { context }).pipe(
      tap((status) => {
        if (status.accepted) {
          this.acceptedBy.set(userId);
        }
      }),
      map((status) => status.accepted),
      catchError(() => {
        this.acceptedBy.set(userId);
        return of(true);
      }),
    );
  }

  accept(): Observable<LegalStatus> {
    const userId = this.auth.user()?.id ?? null;
    return this.http.post<LegalStatus>(`${AUTH_API}/legal/accept`, null).pipe(
      tap(() => this.acceptedBy.set(userId)),
    );
  }
}

/**
 * Va como canActivateChild: corre después del authGuard del padre, cuando ya hay sesión. Sin aceptar los textos
 * vigentes, lleva a "Aceptar términos" recordando la página pedida.
 */
export const legalGuard: CanActivateChildFn = (_route, state) => {
  const router = inject(Router);
  return inject(LegalService).isAccepted().pipe(
    map((accepted) => accepted ? true : router.createUrlTree(['/aceptar-terminos'], { queryParams: returnQuery(state.url) })),
  );
};
