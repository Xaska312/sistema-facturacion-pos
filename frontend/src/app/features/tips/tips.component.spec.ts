import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { TipSummary, TipsApi } from '../../core/api/tips.api';
import { TipsComponent } from './tips.component';

function summary(overpaid: number): TipSummary {
  return {
    branchId: 'b1', branches: [{ id: 'b1', name: 'Principal' }], from: '2026-11-01', to: '2026-11-02',
    collected: 0, count: 0, byMethod: [], pending: 0, overpaid, people: [], payouts: [],
  } as TipSummary;
}

describe('TipsComponent', () => {
  function render(overpaid: number): HTMLElement {
    const api = jasmine.createSpyObj<TipsApi>('TipsApi', ['summary', 'payout']);
    api.summary.and.returnValue(of(summary(overpaid)));
    TestBed.configureTestingModule({
      imports: [TipsComponent],
      providers: [MessageService, { provide: TipsApi, useValue: api }],
    });
    const fixture = TestBed.createComponent(TipsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('avisa lo repartido de más cuando se anuló una venta con propina ya repartida (decisión 277)', () => {
    const el = render(3000);
    expect(el.textContent).toContain('Repartido de más');
    expect(el.textContent).toMatch(/3\.000/);
  });

  it('no muestra el aviso si no hay nada repartido de más', () => {
    expect(render(0).textContent).not.toContain('Repartido de más');
  });
});
