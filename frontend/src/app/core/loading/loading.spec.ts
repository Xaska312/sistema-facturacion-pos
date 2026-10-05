import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LoadingService, SKIP_GLOBAL_LOADING, loadingInterceptor } from './loading';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([loadingInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => backend.verify());

  it('se activa mientras haya peticiones en curso', () => {
    http.get('/api/a').subscribe();
    http.get('/api/b').subscribe();
    expect(loading.active()).toBeTrue();

    backend.expectOne('/api/a').flush({});
    expect(loading.active()).toBeTrue();

    backend.expectOne('/api/b').flush({});
    expect(loading.active()).toBeFalse();
  });

  it('se apaga también cuando la petición falla', () => {
    http.get('/api/x').subscribe({ error: () => undefined });
    backend.expectOne('/api/x').flush({}, { status: 500, statusText: 'Error' });
    expect(loading.active()).toBeFalse();
  });

  it('ignora las peticiones marcadas', () => {
    http.get('/api/poll', { context: new HttpContext().set(SKIP_GLOBAL_LOADING, true) }).subscribe();
    expect(loading.active()).toBeFalse();
    backend.expectOne('/api/poll').flush({});
  });

  it('el contador nunca baja de cero', () => {
    loading.stop();
    loading.start();
    expect(loading.active()).toBeTrue();
  });
});
