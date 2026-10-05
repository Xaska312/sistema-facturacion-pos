import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReportsApi, reportParams } from './reports.api';

describe('ReportsApi', () => {
  let api: ReportsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ReportsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('solo envía los filtros con valor', () => {
    const params = reportParams({ from: '2026-10-01', to: '2026-10-05', branchId: null, sellerId: '' });
    expect(params.keys()).toEqual(['from', 'to']);
  });

  it('descarga el CSV como archivo', () => {
    api.csv('taxes', { from: '2026-10-01', to: null, branchId: 'b1', sellerId: null }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/reports/taxes.csv');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('branchId')).toBe('b1');
    req.flush(new Blob(['x']));
  });

  it('el inventario valorizado no lleva fechas', () => {
    api.csv('inventory/valuation', { from: '2026-10-01', to: '2026-10-05', branchId: null, sellerId: null }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/reports/inventory/valuation.csv');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(new Blob(['x']));
  });
});
