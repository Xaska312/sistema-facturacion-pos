import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { LegalService } from '../../core/legal/legal.service';
import { AcceptLegalComponent } from './accept-legal.component';
import { LegalPageComponent } from './legal-page.component';

describe('páginas legales', () => {
  const auth = { isAuthenticated: () => false, hasTenant: () => false, logout: () => of(undefined) };

  it('muestra la política de datos con sus numerales y el correo de contacto', () => {
    TestBed.configureTestingModule({
      imports: [LegalPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { data: new BehaviorSubject({ legal: 'privacidad' }), snapshot: { fragment: null } },
        },
      ],
    });
    const fixture = TestBed.createComponent(LegalPageComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Política de Tratamiento de Datos Personales');
    expect(el.querySelector('#derechos')).not.toBeNull();
    expect(el.textContent).toContain('soporte@xaska.co');
  });

  it('"Antes de seguir" acepta y vuelve a la página pedida', () => {
    const legal = jasmine.createSpyObj<LegalService>('LegalService', ['accept']);
    legal.accept.and.returnValue(of({ accepted: true, termsVersion: '1.0', privacyVersion: '1.0' }));
    TestBed.configureTestingModule({
      imports: [AcceptLegalComponent],
      providers: [
        // Cualquier ruta existe: al aceptar navega a /app/ventas sin error de "ruta no encontrada".
        provideRouter([{ path: '**', children: [] }]),
        { provide: AuthService, useValue: auth },
        { provide: LegalService, useValue: legal },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/app/ventas' }) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(AcceptLegalComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/terminos"]')).not.toBeNull();
    const button = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Acepto'));
    button?.click();
    expect(legal.accept).toHaveBeenCalled();
  });
});
