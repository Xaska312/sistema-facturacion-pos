import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionResponse } from '../api/api.models';
import { AuthService } from './auth.service';
import { fakeToken } from './jwt.testing';
import { REFRESH_LOCK, RefreshLock } from './refresh-lock';

const passthrough: RefreshLock = (source) => source;

function session(payload: object): SessionResponse {
  return {
    accessToken: fakeToken(payload),
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'u1', email: 'ana@test.co', fullName: 'Ana', platformAdmin: false, emailVerified: true },
    tenantId: null,
    permissions: [],
    tenants: [],
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      // Sin Web Locks en las pruebas: la petición sale en el acto (refresh-lock.spec prueba el candado).
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: REFRESH_LOCK, useValue: passthrough }],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login guarda el token solo en memoria y sin negocio', () => {
    service.login('ana@test.co', 'Clave12345678').subscribe();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.withCredentials).toBeTrue();
    request.flush(session({ sub: 'u1', exp: 9999999999, typ: 'platform' }));

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.hasTenant()).toBeFalse();
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('select-tenant expone tid y permisos del token', () => {
    service.selectTenant('t1').subscribe();
    http.expectOne('/api/v1/auth/select-tenant').flush(
      session({ sub: 'u1', exp: 9999999999, typ: 'tenant', tid: 't1', perms: ['branches:read'] }),
    );
    expect(service.tenantId()).toBe('t1');
    expect(service.hasPermission('branches:read')).toBeTrue();
    expect(service.hasPermission('sales:void')).toBeFalse();
  });

  it('peticiones de refresh concurrentes comparten una sola llamada', () => {
    const results: boolean[] = [];
    service.refresh().subscribe((ok) => results.push(ok));
    service.refresh().subscribe((ok) => results.push(ok));
    http.expectOne('/api/v1/auth/refresh').flush(session({ sub: 'u1', exp: 9999999999, typ: 'platform' }));
    expect(results).toEqual([true, true]);
  });

  it('un refresh fallido limpia la sesión', () => {
    let result: boolean | undefined;
    service.refresh().subscribe((ok) => (result = ok));
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(result).toBeFalse();
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('confirmar el correo con sesión lo marca como confirmado sin volver a iniciar sesión', () => {
    service.login('ana@test.co', 'Clave12345678').subscribe();
    const unverified = session({ sub: 'u1', exp: 9999999999, typ: 'platform' });
    unverified.user = { ...unverified.user, emailVerified: false };
    http.expectOne('/api/v1/auth/login').flush(unverified);
    expect(service.user()?.emailVerified).toBeFalse();

    service.verifyEmail('tok').subscribe();
    const request = http.expectOne('/api/v1/auth/verify-email');
    expect(request.request.body).toEqual({ token: 'tok' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne('/api/v1/auth/me').flush({
      user: { id: 'u1', email: 'ana@test.co', fullName: 'Ana', platformAdmin: false, emailVerified: true },
      tenantId: null,
      permissions: [],
    });
    expect(service.user()?.emailVerified).toBeTrue();
  });

  it('reloadUser actualiza la cuenta de la sesión', () => {
    service.login('ana@test.co', 'Clave12345678').subscribe();
    http.expectOne('/api/v1/auth/login').flush(session({ sub: 'u1', exp: 9999999999, typ: 'platform' }));
    service.reloadUser().subscribe();
    http.expectOne('/api/v1/auth/me').flush({
      user: { id: 'u1', email: 'ana@test.co', fullName: 'Ana María', platformAdmin: false, emailVerified: true },
      tenantId: null,
      permissions: [],
    });
    expect(service.user()?.fullName).toBe('Ana María');
  });

  it('pedir el enlace de contraseña nueva envía solo el correo', () => {
    service.requestPasswordReset('ana@test.co').subscribe();
    const request = http.expectOne('/api/v1/auth/password-reset/request');
    expect(request.request.body).toEqual({ email: 'ana@test.co' });
    request.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('sin conexión al renovar conserva la sesión (no se pierde el carrito)', () => {
    service.login('ana@test.co', 'Clave12345678').subscribe();
    http.expectOne('/api/v1/auth/login').flush(session({ sub: 'u1', exp: 9999999999, typ: 'platform' }));
    let outcome: string | undefined;
    service.renew().subscribe((o) => (outcome = o));
    http.expectOne('/api/v1/auth/refresh').error(new ProgressEvent('error'), { status: 0 });
    expect(outcome).toBe('unreachable');
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('si otra pestaña eligió otro negocio, avisa en vez de seguir como si nada', () => {
    service.selectTenant('t1').subscribe();
    http.expectOne('/api/v1/auth/select-tenant').flush(
      session({ sub: 'u1', exp: 9999999999, typ: 'tenant', tid: 't1', perms: [] }),
    );
    let outcome: string | undefined;
    service.renew().subscribe((o) => (outcome = o));
    http.expectOne('/api/v1/auth/refresh').flush(
      session({ sub: 'u1', exp: 9999999999, typ: 'tenant', tid: 't2', perms: [] }),
    );
    expect(outcome).toBe('tenant-changed');
    expect(service.tenantId()).toBe('t2');
  });
});
