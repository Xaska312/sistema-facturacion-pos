import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { SILENT_ALL_ERRORS } from '../errors/error.interceptor';
import { LegalService } from './legal.service';

describe('LegalService', () => {
  let http: HttpTestingController;
  let service: LegalService;
  const user = signal<{ id: string } | null>({ id: 'u1' });

  beforeEach(() => {
    user.set({ id: 'u1' });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { user } }],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(LegalService);
  });

  afterEach(() => http.verify());

  it('pregunta al servidor una vez; si ya aceptó, no vuelve a preguntar', () => {
    let accepted: boolean | undefined;
    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectOne('/api/v1/auth/legal').flush({ accepted: true, termsVersion: '1.0', privacyVersion: '1.0' });
    expect(accepted).toBeTrue();

    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectNone('/api/v1/auth/legal');
    expect(accepted).toBeTrue();
  });

  it('sin aceptar devuelve false; al aceptar queda guardado para ese usuario', () => {
    let accepted: boolean | undefined;
    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectOne('/api/v1/auth/legal').flush({ accepted: false, termsVersion: '1.0', privacyVersion: '1.0' });
    expect(accepted).toBeFalse();

    service.accept().subscribe();
    const req = http.expectOne('/api/v1/auth/legal/accept');
    expect(req.request.method).toBe('POST');
    req.flush({ accepted: true, termsVersion: '1.0', privacyVersion: '1.0' });

    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectNone('/api/v1/auth/legal');
    expect(accepted).toBeTrue();

    // Otra persona en el mismo navegador: se vuelve a preguntar.
    user.set({ id: 'u2' });
    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectOne('/api/v1/auth/legal').flush({ accepted: false, termsVersion: '1.0', privacyVersion: '1.0' });
    expect(accepted).toBeFalse();
  });

  it('si el servidor no responde, no bloquea la app', () => {
    let accepted: boolean | undefined;
    service.isAccepted().subscribe((v) => (accepted = v));
    const req = http.expectOne('/api/v1/auth/legal');
    expect(req.request.context.get(SILENT_ALL_ERRORS)).toBeTrue();
    req.flush(null, { status: 503, statusText: 'Unavailable' });
    expect(accepted).toBeTrue();
    // Hasta recargar no se vuelve a preguntar en cada pantalla.
    service.isAccepted().subscribe((v) => (accepted = v));
    http.expectNone('/api/v1/auth/legal');
  });
});
