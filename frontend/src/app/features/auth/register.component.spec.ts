import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ToastService } from '../../shared/ui/toast.service';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RegisterComponent } from './register.component';
import { BillingApi } from '../../core/api/billing.api';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['register']);
    auth.register.and.returnValue(of({ id: 'u1', email: 'ana@demo.co', fullName: 'Ana', platformAdmin: false,
      emailVerified: false }));
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), ToastService, { provide: AuthService, useValue: auth },
        { provide: BillingApi, useValue: { pricing: () => of({ trialDays: 14, plans: [], addons: [] }) } }],
    });
  });

  it('dice de entrada que la prueba es gratis y, sin plan elegido, olvida uno anterior (decisión 346)', () => {
    localStorage.setItem('xaska.startPlan', JSON.stringify({ plan: 'NEGOCIO', annual: false }));
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pruébalo gratis 14 días');
    expect(localStorage.getItem('xaska.startPlan')).toBeNull();
  });

  it('con un plan elegido en Precios lo recuerda para crear el negocio', () => {
    localStorage.removeItem('xaska.startPlan');
    TestBed.overrideProvider(ActivatedRoute, { useValue: { snapshot: { queryParamMap: convertToParamMap({ plan: 'NEGOCIO', ciclo: 'anual' }) } } });
    TestBed.createComponent(RegisterComponent);
    expect(JSON.parse(localStorage.getItem('xaska.startPlan') ?? '{}')).toEqual({ plan: 'NEGOCIO', annual: true });
    localStorage.removeItem('xaska.startPlan');
  });

  it('pide aceptar los términos y la política antes de registrar (decisión 250)', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('soporte@xaska.co');
    expect(el.querySelector('a[href="/terminos"]')).not.toBeNull();
    expect(el.querySelector('a[href="/privacidad"]')).not.toBeNull();

    const form = fixture.componentInstance.form;
    form.patchValue({ fullName: 'Ana Pérez', email: 'ana@demo.co', password: 'ClaveSegura123' });
    expect(form.valid).toBeFalse();

    const box = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.checked).toBeFalse();
    box?.click();
    expect(form.valid).toBeTrue();

    fixture.componentInstance.submit();
    expect(auth.register).toHaveBeenCalledWith(jasmine.objectContaining({ acceptTerms: true }));
  });
});
