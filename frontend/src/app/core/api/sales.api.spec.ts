import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CashSession, SaleInput } from './api.models';
import { CashApi } from './cash.api';
import { SalesApi, newIdempotencyKey } from './sales.api';

describe('SalesApi y CashApi', () => {
  let sales: SalesApi;
  let cash: CashApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    sales = TestBed.inject(SalesApi);
    cash = TestBed.inject(CashApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envía la venta con su Idempotency-Key', () => {
    const input: SaleInput = {
      customerId: null,
      items: [{ productId: 'p', unitId: null, quantity: 1, discountPercent: null, unitPrice: 1000 }],
      payments: [{ paymentMethodId: 'cash', amount: 1000, reference: null }],
      expectedTotal: 1000,
      notes: null,
    };
    sales.create(input, 'sale-123456789').subscribe();
    const req = http.expectOne('/api/v1/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('sale-123456789');
    expect(req.request.body).toEqual(input);
    req.flush({});
  });

  it('pide el precio solo con los parámetros presentes', () => {
    sales.price('p1', null, 'c1').subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/sales/price');
    expect(req.request.params.get('productId')).toBe('p1');
    expect(req.request.params.has('unitId')).toBeFalse();
    expect(req.request.params.get('customerId')).toBe('c1');
    req.flush({});
  });

  it('sin caja abierta (204) la sesión actual es null', () => {
    let result: CashSession | null | undefined;
    cash.current().subscribe((s) => (result = s));
    http.expectOne('/api/v1/cash/sessions/current').flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toBeNull();
  });

  it('genera claves de idempotencia válidas para el backend', () => {
    const key = newIdempotencyKey('sale');
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
    expect(newIdempotencyKey('sale')).not.toBe(key);
  });
});
