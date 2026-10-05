import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReportSummary } from '../../core/api/api.models';
import { InventoryApi } from '../../core/api/inventory.api';
import { OrganizationApi } from '../../core/api/organization.api';
import { ReportsApi } from '../../core/api/reports.api';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardComponent } from './dashboard.component';

function summary(total: number, salesCount: number): ReportSummary {
  return {
    from: '', to: '', salesCount, grossTotal: total, discountTotal: 0, subtotal: total, taxTotal: 0, total,
    averageTicket: salesCount ? total / salesCount : 0, cost: 0, profit: total / 2, marginPercent: 50, voidedCount: 0,
    voidedTotal: 0,
  };
}

describe('DashboardComponent', () => {
  let reports: jasmine.SpyObj<ReportsApi>;

  beforeEach(() => {
    reports = jasmine.createSpyObj<ReportsApi>('ReportsApi',
      ['summary', 'salesBy', 'products', 'byPaymentMethod', 'dashboard']);
    reports.summary.and.returnValues(of(summary(1100, 10)), of(summary(1000, 8)));
    reports.salesBy.and.returnValue(of([]));
    reports.products.and.returnValue(of([]));
    reports.byPaymentMethod.and.returnValue(of([]));
    reports.dashboard.and.returnValue(of({
      date: '2026-10-05', today: summary(1100, 10), yesterdayTotal: 1000,
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, salesCount: 0, total: hour === 10 ? 1100 : 0 })),
      last7Days: [], topProducts: [], byPaymentMethod: [],
    }));
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: ReportsApi, useValue: reports },
        { provide: OrganizationApi, useValue: { branches: () => of({ content: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }) } },
        { provide: InventoryApi, useValue: { alerts: () => of([]) } },
        { provide: AuthService, useValue: { hasPermission: () => true, user: signal(null) } },
      ],
    });
  });

  it('muestra los indicadores de hoy con la variación frente a ayer', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('$ 1.100');
    expect(element.textContent).toContain('+10 %');
    expect(element.textContent).toContain('vs. ayer');
    expect(reports.dashboard).toHaveBeenCalledWith(null);
    fixture.destroy();
  });

  it('guarda el periodo elegido en la URL', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.select({ period: 'last7', from: null, to: null, branchId: 'b1' });
    const [, extras] = (router.navigate as jasmine.Spy).calls.mostRecent().args;
    expect(extras.queryParams).toEqual({ periodo: '7d', desde: null, hasta: null, sucursal: 'b1' });
    fixture.destroy();
  });

  it('si falla la carga ofrece reintentar', () => {
    reports.summary.and.returnValue(throwError(() => new Error('sin red')));
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar el tablero');
    fixture.destroy();
  });
});
