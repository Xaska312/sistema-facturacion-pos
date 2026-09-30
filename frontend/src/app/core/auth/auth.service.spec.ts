import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionResponse } from '../api/api.models';
import { AuthService } from './auth.service';
import { fakeToken } from './jwt.testing';

function session(payload: object): SessionResponse {
  return {
    accessToken: fakeToken(payload),
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'u1', email: 'ana@test.co', fullName: 'Ana', platformAdmin: false },
    tenantId: null,
    permissions: [],
    tenants: [],
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
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
});
