import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['register']);
    auth.register.and.returnValue(of({ id: 'u1', email: 'ana@demo.co', fullName: 'Ana', platformAdmin: false,
      emailVerified: false }));
    TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), MessageService, { provide: AuthService, useValue: auth }],
    });
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
