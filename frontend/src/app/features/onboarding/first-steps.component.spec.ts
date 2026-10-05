import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AccessApi } from '../../core/api/access.api';
import { PageResponse } from '../../core/api/api.models';
import { CashApi } from '../../core/api/cash.api';
import { CatalogApi } from '../../core/api/catalog.api';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { SalesApi } from '../../core/api/sales.api';
import { AuthService } from '../../core/auth/auth.service';
import { FirstStepsComponent } from './first-steps.component';
import { firstStepsKey } from './first-steps';

/** Página vacía con solo el total: los primeros pasos solo miran cuántos hay. */
function total<T>(totalElements: number): Observable<PageResponse<T>> {
  return of({ content: [], page: 0, size: 1, totalElements, totalPages: totalElements > 0 ? totalElements : 0 });
}

describe('FirstStepsComponent', () => {
  const key = firstStepsKey('u1', 't1');
  let owner: boolean;
  let permissions: Set<string>;

  beforeEach(() => {
    localStorage.removeItem(key);
    owner = true;
    permissions = new Set(['branches:read', 'products:read', 'products:manage', 'inventory:read', 'members:read',
      'cash:read', 'sales:read', 'sales:create', 'cash:operate']);
    TestBed.configureTestingModule({
      imports: [FirstStepsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'u1' }),
            tenantId: signal('t1'),
            currentTenant: () => ({ owner }),
            hasPermission: (p: string) => permissions.has(p),
          },
        },
        { provide: OrganizationApi, useValue: { branches: () => total(1) } },
        { provide: CatalogApi, useValue: { categories: () => of([{ id: 'c', parentId: null, name: 'Bebidas', active: true }]), products: () => total(0) } },
        { provide: InventoryApi, useValue: { documents: () => total(0) } },
        { provide: AccessApi, useValue: { members: () => total(1), invitations: () => total(0) } },
        { provide: CashApi, useValue: { sessions: () => throwError(() => new Error('sin red')) } },
        { provide: SalesApi, useValue: { search: () => total(0) } },
      ],
    });
  });

  afterEach(() => localStorage.removeItem(key));

  it('calcula el avance con datos reales y resalta el siguiente paso', () => {
    const fixture = TestBed.createComponent(FirstStepsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Primeros pasos');
    expect(element.textContent).toContain('2 de 7');
    expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('29');
    const next = element.querySelector('.step--next');
    expect(next?.textContent).toContain('Carga tus productos');
    expect(next?.querySelector('a')?.textContent).toContain('Cargar productos');
    // Sin permiso de inventory:adjust el paso de existencias no tiene botón.
    const stock = Array.from(element.querySelectorAll('.step')).find((s) => s.textContent?.includes('existencias iniciales'));
    expect(stock?.querySelector('a')).toBeNull();
  });

  it('se puede ocultar y volver a mostrar', () => {
    const fixture = TestBed.createComponent(FirstStepsComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    (Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Ocultar lista')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).not.toContain('Carga tus productos');
    expect(localStorage.getItem(key)).toBe('dismissed');

    (Array.from(element.querySelectorAll('button')).find((b) => b.textContent?.includes('Mostrar los primeros pasos')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.textContent).toContain('Carga tus productos');
  });

  it('no aparece para quien no administra el negocio', () => {
    owner = false;
    const fixture = TestBed.createComponent(FirstStepsComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('');
  });
});
