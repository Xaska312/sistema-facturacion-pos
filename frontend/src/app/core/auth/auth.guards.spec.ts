import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { permissionGuard, tenantGuard } from './auth.guards';
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

  const run = (guard: typeof tenantGuard, data: Record<string, unknown> = {}) =>
    TestBed.runInInjectionContext(() =>
      guard({ data } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it('tenantGuard redirige a /negocios si el token no tiene negocio', () => {
    auth.hasTenant.and.returnValue(false);
    const result = run(tenantGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/negocios');
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
