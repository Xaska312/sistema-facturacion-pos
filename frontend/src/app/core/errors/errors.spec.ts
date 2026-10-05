import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { errorInterceptor } from './error.interceptor';
import { InlineErrorScope } from './inline-errors';
import { fieldProblemText, problemFieldErrors, problemMessage, problemTitle } from './problem';

function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('problem', () => {
  it('muestra los errores de campo con etiquetas en español', () => {
    const error = httpError(400, { title: 'Solicitud inválida', errors: [{ field: 'cityCode', message: 'no existe' }] });
    expect(problemFieldErrors(error)).toEqual([{ field: 'cityCode', message: 'no existe' }]);
    expect(problemMessage(error)).toBe('Municipio: no existe');
    expect(fieldProblemText({ field: 'otroCampo', message: 'no es válido' })).toBe('No es válido');
  });

  it('usa el detalle o textos humanos según el estado', () => {
    expect(problemMessage(httpError(409, { detail: 'Ya existe una sucursal con ese código.' })))
      .toBe('Ya existe una sucursal con ese código.');
    expect(problemTitle(httpError(0, null))).toBe('Sin conexión');
    expect(problemTitle(httpError(500, { title: 'Internal Server Error' }))).toBe('Algo salió mal');
    expect(problemMessage(httpError(500, null))).toContain('servidor');
  });
});

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let messages: jasmine.SpyObj<MessageService>;

  beforeEach(() => {
    messages = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MessageService, useValue: messages },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('muestra toast en los errores', () => {
    http.get('/api/x').subscribe({ error: () => undefined });
    backend.expectOne('/api/x').flush({ detail: 'No permitido' }, { status: 422, statusText: 'Unprocessable' });
    expect(messages.add).toHaveBeenCalledTimes(1);
  });

  it('no muestra toast de 4xx dentro de un formulario con errores en línea, pero sí de 5xx', () => {
    const scope = TestBed.inject(InlineErrorScope);
    scope.run(http.get('/api/a')).subscribe({ error: () => undefined });
    backend.expectOne('/api/a').flush({ detail: 'Duplicado' }, { status: 409, statusText: 'Conflict' });
    expect(messages.add).not.toHaveBeenCalled();
    expect(scope.active).toBeFalse();

    scope.run(http.get('/api/b')).subscribe({ error: () => undefined });
    backend.expectOne('/api/b').flush(null, { status: 500, statusText: 'Error' });
    expect(messages.add).toHaveBeenCalledTimes(1);
  });
});
