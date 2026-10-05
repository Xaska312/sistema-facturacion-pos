import { TestBed } from '@angular/core/testing';
import { PeriodSelection } from '../features/reports/periods';
import { PeriodFilterComponent, rangeProblem } from './period-filter.component';

describe('PeriodFilterComponent', () => {
  const base: PeriodSelection = { period: 'today', from: null, to: null, branchId: null };

  function setup() {
    TestBed.configureTestingModule({ imports: [PeriodFilterComponent] });
    const fixture = TestBed.createComponent(PeriodFilterComponent);
    fixture.componentRef.setInput('selection', base);
    fixture.componentRef.setInput('branches', [{ id: 'b1', name: 'Norte' }]);
    const emitted: PeriodSelection[] = [];
    fixture.componentInstance.selectionChange.subscribe((s) => emitted.push(s));
    fixture.detectChanges();
    return { fixture, emitted, element: fixture.nativeElement as HTMLElement };
  }

  it('marca el periodo actual y emite al elegir otro', () => {
    const { emitted, element } = setup();
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="group"] button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Hoy', 'Ayer', '7 días', '30 días', 'Mes actual', 'Rango']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    buttons[2].click();
    expect(emitted).toEqual([{ period: 'last7', from: null, to: null, branchId: null }]);
  });

  it('el rango personalizado se emite solo con fechas válidas', () => {
    const { fixture, emitted, element } = setup();
    const custom = Array.from(element.querySelectorAll<HTMLButtonElement>('[role="group"] button')).at(-1);
    custom?.click();
    fixture.detectChanges();
    const [from, to] = Array.from(element.querySelectorAll<HTMLInputElement>('input[type="date"]'));
    from.value = '2026-10-05';
    from.dispatchEvent(new Event('change'));
    to.value = '2026-10-01';
    to.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('posterior');
    to.value = '2026-10-06';
    to.dispatchEvent(new Event('change'));
    expect(emitted.at(-1)).toEqual({ period: 'custom', from: '2026-10-05', to: '2026-10-06', branchId: null });
  });

  it('cambia de sucursal', () => {
    const { emitted, element } = setup();
    const select = element.querySelector('select') as HTMLSelectElement;
    select.value = 'b1';
    select.dispatchEvent(new Event('change'));
    expect(emitted.at(-1)?.branchId).toBe('b1');
  });

  it('valida el rango', () => {
    expect(rangeProblem('', '2026-10-01')).toBe('Elige las dos fechas.');
    expect(rangeProblem('2024-01-01', '2026-01-01')).toBe('El rango máximo es de un año.');
    expect(rangeProblem('2026-10-01', '2026-10-05')).toBeNull();
  });
});
