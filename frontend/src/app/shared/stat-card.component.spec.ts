import { TestBed } from '@angular/core/testing';
import { percentChange, sparklinePoints } from './sparkline';
import { StatCardComponent } from './stat-card.component';

describe('sparkline', () => {
  it('escala los valores a la caja (el mayor arriba)', () => {
    expect(sparklinePoints([0, 10], 100, 28, 2)).toBe('0,26 100,2');
  });

  it('valores iguales o uno solo → línea a media altura', () => {
    expect(sparklinePoints([5, 5, 5], 100, 28)).toBe('0,14 50,14 100,14');
    expect(sparklinePoints([7], 100, 28)).toBe('0,14 100,14');
    expect(sparklinePoints([])).toBe('');
  });

  it('variación porcentual con un decimal', () => {
    expect(percentChange(110, 100)).toBe(10);
    expect(percentChange(90, 120)).toBe(-25);
    expect(percentChange(50, 0)).toBeNull();
    expect(percentChange(50, null)).toBeNull();
  });
});

describe('StatCardComponent', () => {
  it('muestra valor, variación coloreada y tendencia', () => {
    TestBed.configureTestingModule({ imports: [StatCardComponent] });
    const fixture = TestBed.createComponent(StatCardComponent);
    fixture.componentRef.setInput('label', 'Ventas de hoy');
    fixture.componentRef.setInput('value', '$ 1.284.500');
    fixture.componentRef.setInput('change', 12.5);
    fixture.componentRef.setInput('trend', [1, 3, 2, 5]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('$ 1.284.500');
    expect(element.textContent).toContain('+12,5 %');
    expect(element.querySelector('.text-success')).not.toBeNull();
    expect(element.querySelector('polyline')?.getAttribute('points')).toBeTruthy();

    fixture.componentRef.setInput('invertTrend', true);
    fixture.detectChanges();
    expect(element.querySelector('.text-danger')).not.toBeNull();
  });
});
