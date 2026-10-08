import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { authGuard, permissionGuard, tenantGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('guards', () => {
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['hasTenant', 'hasPermission', 'isAuthenticated', 'restore']);
    auth.restore.and.returnValue(of(false));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  const run = (guard: typeof tenantGuard, data: Record<string, unknown> = {}, url?: string) =>
    TestBed.runInInjectionContext(() =>
      guard({ data } as unknown as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

  it('tenantGuard redirige a /negocios si el token no tiene negocio', () => {
    auth.hasTenant.and.returnValue(false);
    const result = run(tenantGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/negocios');
  });

  it('tenantGuard recuerda la página pedida para volver después de elegir negocio (QA UI-11)', () => {
    auth.hasTenant.and.returnValue(false);
    const result = run(tenantGuard, {}, '/app/inventario') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/negocios?returnUrl=%2Fapp%2Finventario');
  });

  it('authGuard sin sesión lleva al login con la página pedida (QA UI-11)', (done) => {
    auth.isAuthenticated.and.returnValue(false);
    const result = run(authGuard, {}, '/app/ventas') as unknown as Observable<UrlTree>;
    result.subscribe((tree) => {
      expect(TestBed.inject(Router).serializeUrl(tree)).toBe('/login?returnUrl=%2Fapp%2Fventas');
      done();
    });
  });

  it('tenantGuard deja pasar con negocio seleccionado', () => {
    auth.hasTenant.and.returnValue(true);
    expect(run(tenantGuard)).toBeTrue();
  });

  it('permissionGuard bloquea sin el permiso de la ruta y lleva a "sin permiso"', () => {
    auth.hasPermission.and.returnValue(false);
    const result = run(permissionGuard, { permission: 'branches:manage' }) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/app/sin-permiso');
  });

  it('permissionGuard deja pasar con el permiso', () => {
    auth.hasPermission.and.returnValue(true);
    expect(run(permissionGuard, { permission: 'branches:read' })).toBeTrue();
  });
});
