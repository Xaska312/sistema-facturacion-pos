import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { isEmailNotVerified } from '../tenants/create-tenant.component';
import { samePasswords } from './reset-password.component';
import { VerifyEmailComponent } from './verify-email.component';

describe('VerifyEmailComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(token: string | undefined) {
    const fixture = TestBed.createComponent(VerifyEmailComponent);
    fixture.componentRef.setInput('token', token);
    fixture.detectChanges();
    return fixture;
  }

  it('confirma el correo con el token del enlace', () => {
    const fixture = render('abc');
    const request = http.expectOne('/api/v1/auth/verify-email');
    expect(request.request.body).toEqual({ token: 'abc' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('¡Correo confirmado!');
  });

  it('muestra el motivo si el enlace venció o ya se usó', () => {
    const fixture = render('viejo');
    http.expectOne('/api/v1/auth/verify-email').flush(
      { detail: 'El enlace no es válido o ya venció. Pide uno nuevo.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No pudimos confirmar tu correo');
    expect(text).toContain('ya venció');
  });

  it('sin token no llama al servidor', () => {
    const fixture = render(undefined);
    http.expectNone('/api/v1/auth/verify-email');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('incompleto');
  });
});

describe('formularios de correo', () => {
  it('las dos contraseñas deben coincidir', () => {
    const group = (a: string, b: string) =>
      new FormGroup({ password: new FormControl(a), repeat: new FormControl(b) }, { validators: samePasswords });
    expect(group('ClaveNueva2026', 'ClaveNueva2026').valid).toBeTrue();
    expect(group('ClaveNueva2026', 'Otra').hasError('mismatch')).toBeTrue();
    expect(group('ClaveNueva2026', '').hasError('mismatch')).toBeFalse();
  });

  it('reconoce el 403 de correo sin confirmar por su código', () => {
    expect(isEmailNotVerified(new HttpErrorResponse({ status: 403, error: { code: 'EMAIL_NOT_VERIFIED' } }))).toBeTrue();
    expect(isEmailNotVerified(new HttpErrorResponse({ status: 403, error: { detail: 'Sin permiso' } }))).toBeFalse();
  });
});
