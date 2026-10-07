import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import {
  CreateTenantRequest,
  RegisterRequest,
  SessionResponse,
  TenantSummary,
  UserSummary,
} from '../api/api.models';
import { AccessClaims, decodeAccessToken } from './jwt';
import { REFRESH_LOCK } from './refresh-lock';

export type RefreshOutcome = 'renewed' | 'tenant-changed' | 'expired' | 'unreachable';

export const AUTH_API = '/api/v1/auth';

interface SessionState {
  accessToken: string;
  claims: AccessClaims;
  user: UserSummary;
}

/**
 * Estado de sesión. El access token vive SOLO en memoria (signal); el refresh token
 * está en una cookie HttpOnly que JavaScript no puede leer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly session = signal<SessionState | null>(null);
  private readonly tenantList = signal<TenantSummary[]>([]);
  private readonly refreshLock = inject(REFRESH_LOCK);
  private refreshInFlight: Observable<RefreshOutcome> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly tenantId = computed(() => this.session()?.claims.tid ?? null);
  readonly hasTenant = computed(() => this.tenantId() !== null);
  readonly permissions = computed(() => new Set(this.session()?.claims.perms ?? []));
  /** Administrador de plataforma (claim padm): ve la consola /plataforma. */
  readonly isPlatformAdmin = computed(() => this.session()?.claims.padm === true);
  readonly tenants = this.tenantList.asReadonly();
  readonly currentTenant = computed(() => {
    const id = this.tenantId();
    return id ? (this.tenantList().find((t) => t.id === id) ?? null) : null;
  });

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasPermission(permission: string): boolean {
    return this.permissions().has(permission);
  }

  register(request: RegisterRequest): Observable<UserSummary> {
    return this.http.post<UserSummary>(`${AUTH_API}/register`, request);
  }

  /**
   * Confirma el correo con el token del enlace (funciona con o sin sesión). Con sesión vuelve a leer la cuenta: el
   * enlace podría ser de otra cuenta distinta a la abierta en este navegador.
   */
  verifyEmail(token: string): Observable<void> {
    return this.http.post<void>(`${AUTH_API}/verify-email`, { token }).pipe(
      switchMap(() => (this.isAuthenticated() ? this.reloadUser().pipe(map(() => undefined)) : of(undefined))),
    );
  }

  /** Reenvía el correo de confirmación a la cuenta de la sesión (429 si se pidió hace menos de un minuto). */
  resendVerification(): Observable<void> {
    return this.http.post<void>(`${AUTH_API}/verify-email/resend`, null);
  }

  /** "¿Olvidaste tu contraseña?": siempre responde igual, exista o no la cuenta. */
  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(`${AUTH_API}/password-reset/request`, { email });
  }

  /** Nueva contraseña con el token del enlace; cierra todas las sesiones de la cuenta. */
  confirmPasswordReset(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${AUTH_API}/password-reset/confirm`, { token, password });
  }

  /** Vuelve a leer la cuenta (p. ej. después de confirmar el correo en otra pestaña). */
  reloadUser(): Observable<UserSummary> {
    return this.http.get<{ user: UserSummary }>(`${AUTH_API}/me`).pipe(
      map((me) => me.user),
      tap((user) => this.session.update((current) => (current ? { ...current, user } : current))),
    );
  }

  /** Marca el correo como confirmado en la sesión actual (si la hay). */
  markEmailVerified(): void {
    this.session.update((current) =>
      current ? { ...current, user: { ...current.user, emailVerified: true } } : current,
    );
  }

  login(email: string, password: string): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${AUTH_API}/login`, { email, password }, { withCredentials: true })
      .pipe(
        tap((response) => {
          this.applySession(response);
          this.tenantList.set(response.tenants);
        }),
      );
  }

  selectTenant(tenantId: string): Observable<SessionResponse> {
    return this.http
      .post<SessionResponse>(`${AUTH_API}/select-tenant`, { tenantId }, { withCredentials: true })
      .pipe(tap((response) => this.applySession(response)));
  }

  /**
   * Renueva el access token con la cookie de refresh. Si ya hay una renovación en curso, todas las peticiones
   * esperan la misma (cola de peticiones del interceptor); entre pestañas se ejecuta de a una ({@link REFRESH_LOCK}).
   *
   * - `renewed`: sesión renovada, mismo negocio.
   * - `tenant-changed`: la cookie es de otro negocio (se eligió otro en otra pestaña). La sesión queda en ese negocio
   *   y la petición que falló NO se repite: se escribiría en el negocio equivocado (QA SEG-2).
   * - `expired`: la sesión terminó (401/403): se limpia.
   * - `unreachable`: sin conexión o servidor caído: la sesión se conserva para reintentar (QA SEG-7).
   */
  renew(): Observable<RefreshOutcome> {
    if (!this.refreshInFlight) {
      const current = this.session();
      const previousTenant = current ? (current.claims.tid ?? null) : undefined;
      this.refreshInFlight = this.refreshLock(
        this.http.post<SessionResponse>(`${AUTH_API}/refresh`, null, { withCredentials: true }),
      ).pipe(
        map((response): RefreshOutcome => {
          const nextTenant = decodeAccessToken(response.accessToken)?.tid ?? null;
          this.applySession(response);
          return previousTenant !== undefined && nextTenant !== previousTenant ? 'tenant-changed' : 'renewed';
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
            this.clear();
            return of<RefreshOutcome>('expired');
          }
          return of<RefreshOutcome>('unreachable');
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  /** {@link renew} como sí/no (al cargar la app y en los guards). */
  refresh(): Observable<boolean> {
    return this.renew().pipe(map((outcome) => outcome === 'renewed' || outcome === 'tenant-changed'));
  }

  /** Intenta recuperar la sesión al cargar la app (la cookie sobrevive a recargar la página). */
  restore(): Observable<boolean> {
    if (this.isAuthenticated()) {
      return of(true);
    }
    return this.refresh().pipe(
      tap((ok) => {
        if (ok) {
          this.loadTenants().subscribe();
        }
      }),
    );
  }

  loadTenants(): Observable<TenantSummary[]> {
    return this.http.get<TenantSummary[]>('/api/v1/tenants').pipe(tap((list) => this.tenantList.set(list)));
  }

  createTenant(request: CreateTenantRequest): Observable<TenantSummary> {
    return this.http.post<TenantSummary>('/api/v1/tenants', request).pipe(
      tap((tenant) => this.tenantList.update((list) => [...list.filter((t) => t.id !== tenant.id), tenant])),
    );
  }

  retryProvisioning(tenantId: string): Observable<TenantSummary> {
    return this.http.post<TenantSummary>(`/api/v1/tenants/${tenantId}/retry-provisioning`, null).pipe(
      tap((tenant) => this.tenantList.update((list) => list.map((t) => (t.id === tenant.id ? tenant : t)))),
    );
  }

  /**
   * El dueño cierra ("elimina") su negocio: queda suspendido con sus datos y se cierran todas sus sesiones,
   * así que después hay que volver a iniciar sesión.
   */
  closeTenant(tenantId: string, confirmation: string, password: string, reason: string | null): Observable<void> {
    return this.http.post<void>(`/api/v1/tenants/${tenantId}/close`, { confirmation, password, reason });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${AUTH_API}/logout`, null, { withCredentials: true }).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      finalize(() => this.clear()),
    );
  }

  clear(): void {
    this.session.set(null);
    this.tenantList.set([]);
  }

  private applySession(response: SessionResponse): void {
    const claims = decodeAccessToken(response.accessToken);
    if (!claims) {
      this.clear();
      return;
    }
    this.session.set({ accessToken: response.accessToken, claims, user: response.user });
  }
}
