import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { ConfirmOptions, ConfirmService } from './confirm';
import { HasUnsavedChanges, unsavedChangesGuard, warnIfUnsaved } from './unsaved-changes';

describe('unsavedChangesGuard (QA UI-7)', () => {
  let asked: ConfirmOptions | null;
  let authenticated: boolean;

  beforeEach(() => {
    asked = null;
    authenticated = true;
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfirmService, useValue: { ask: (o: ConfirmOptions) => (asked = o) } },
        { provide: AuthService, useValue: { isAuthenticated: () => authenticated } },
      ],
    });
  });

  const run = (component: HasUnsavedChanges, nextUrl = '/app') =>
    TestBed.runInInjectionContext(() =>
      unsavedChangesGuard(component, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot,
        { url: nextUrl } as RouterStateSnapshot),
    );

  it('sin cambios deja salir sin preguntar', () => {
    expect(run({ hasUnsavedChanges: () => false })).toBeTrue();
    expect(asked).toBeNull();
  });

  it('con cambios pregunta y respeta la respuesta', async () => {
    const leave = run({ hasUnsavedChanges: () => true }) as Promise<boolean>;
    asked!.accept();
    expect(await leave).toBeTrue();

    const stay = run({ hasUnsavedChanges: () => true }) as Promise<boolean>;
    asked!.reject!();
    expect(await stay).toBeFalse();
  });

  it('no pregunta al cerrar sesión ni con la sesión vencida', () => {
    expect(run({ hasUnsavedChanges: () => true }, '/login')).toBeTrue();
    authenticated = false;
    expect(run({ hasUnsavedChanges: () => true })).toBeTrue();
    expect(asked).toBeNull();
  });

  it('al cerrar la pestaña solo avisa si hay cambios', () => {
    const clean = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warnIfUnsaved(clean, false);
    expect(clean.defaultPrevented).toBeFalse();
    const dirty = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    warnIfUnsaved(dirty, true);
    expect(dirty.defaultPrevented).toBeTrue();
  });
});
