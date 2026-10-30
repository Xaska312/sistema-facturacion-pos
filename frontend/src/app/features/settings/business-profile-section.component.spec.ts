import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { BusinessProfile, BusinessProfileApi } from '../../core/api/business-profile.api';
import { AuthService } from '../../core/auth/auth.service';
import { BusinessProfileSectionComponent } from './business-profile-section.component';

describe('BusinessProfileSectionComponent (Fase 12a)', () => {
  let api: jasmine.SpyObj<BusinessProfileApi>;
  let auth: jasmine.SpyObj<AuthService>;

  const render = (profile: BusinessProfile) => {
    api = jasmine.createSpyObj<BusinessProfileApi>('BusinessProfileApi', ['get', 'change']);
    api.get.and.returnValue(of(profile));
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['renew', 'loadTenants']);
    auth.renew.and.returnValue(of('renewed'));
    auth.loadTenants.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [BusinessProfileSectionComponent],
      providers: [provideNoopAnimations(), MessageService, { provide: BusinessProfileApi, useValue: api },
        { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(BusinessProfileSectionComponent);
    fixture.detectChanges();
    return fixture;
  };
  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const typeButton = (f: { nativeElement: unknown }, label: string) =>
    Array.from(el(f).querySelectorAll<HTMLButtonElement>('button[role="radio"]'))
      .find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
  const checked = (f: { nativeElement: unknown }) =>
    Array.from(el(f).querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).map((c) => c.checked);

  it('al cambiar de tipo propone sus módulos y guarda renovando la sesión', () => {
    const fixture = render({ businessType: 'RETAIL', modules: ['CREDIT', 'ORDERS', 'QUOTES', 'VARIANTS', 'SCALE'], canEdit: true });
    expect(checked(fixture)).toEqual([true, true, true, true, true, false, false]);
    expect(typeButton(fixture, 'Restaurante').disabled).toBeTrue();

    typeButton(fixture, 'Servicios').click();
    fixture.detectChanges();
    expect(checked(fixture)).toEqual([true, true, true, false, false, false, false]);
    expect(el(fixture).textContent).toContain('Te propusimos los módulos de Servicios');

    api.change.and.returnValue(of({ businessType: 'SERVICES', modules: ['CREDIT', 'ORDERS', 'QUOTES'], canEdit: true }));
    const save = Array.from(el(fixture).querySelectorAll('button')).find((b) => b.textContent?.includes('Guardar tipo'));
    save?.click();
    expect(api.change).toHaveBeenCalledWith('SERVICES', ['CREDIT', 'ORDERS', 'QUOTES']);
    expect(auth.renew).toHaveBeenCalled();
    expect(auth.loadTenants).toHaveBeenCalled();
  });

  it('quien no es el dueño lo ve sin poder cambiarlo', () => {
    const fixture = render({ businessType: 'RESTAURANT', modules: ['ORDERS'], canEdit: false });
    expect(el(fixture).textContent).toContain('Solo el dueño del negocio cambia el tipo y los módulos');
    expect(typeButton(fixture, 'Restaurante').getAttribute('aria-checked')).toBe('true');
    expect(el(fixture).querySelector('fieldset')?.disabled).toBeTrue();
  });
});
