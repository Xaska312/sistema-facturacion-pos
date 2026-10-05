import { TestBed } from '@angular/core/testing';
import { ChartComponent } from './chart.component';
import { foldOthers, readChartTheme, seriesColor } from './chart-config';

describe('chart-config', () => {
  it('lee los colores de los tokens y usa un orden fijo; la comparación es gris', () => {
    const vars: Record<string, string> = { '--chart-1': ' #0d9488 ', '--chart-2': '#eb6834', '--chart-compare': '#839290' };
    const theme = readChartTheme((name) => vars[name] ?? '');
    expect(seriesColor(theme, 0, 'primary')).toBe('#0d9488');
    expect(seriesColor(theme, 1, 'primary')).toBe('#eb6834');
    expect(seriesColor(theme, 1, 'compare')).toBe('#839290');
    // Más series que colores: nunca se inventa un color nuevo.
    expect(seriesColor(theme, 20, 'primary')).toBe(theme.series[theme.series.length - 1]);
  });

  it('agrupa en "Otros" las categorías que sobran', () => {
    const items = ['a', 'b', 'c', 'd'].map((label, i) => ({ label, value: i + 1 }));
    expect(foldOthers(items, 3)).toEqual([{ label: 'd', value: 4 }, { label: 'c', value: 3 }, { label: 'Otros', value: 3 }]);
    expect(foldOthers(items, 6).length).toBe(4);
  });
});

describe('ChartComponent', () => {
  it('pinta el lienzo con etiqueta accesible y la tabla de datos', () => {
    TestBed.configureTestingModule({ imports: [ChartComponent] });
    const fixture = TestBed.createComponent(ChartComponent);
    fixture.componentRef.setInput('labels', ['8 h', '9 h']);
    fixture.componentRef.setInput('series', [{ label: 'Hoy', data: [1000, 3000] }]);
    fixture.componentRef.setInput('ariaLabel', 'Ventas por hora');
    fixture.componentRef.setInput('categoryHeader', 'Hora');
    fixture.detectChanges();
    TestBed.flushEffects();

    const element = fixture.nativeElement as HTMLElement;
    const canvas = element.querySelector('canvas');
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toContain('Ventas por hora. Total $ 4.000');
    const rows = element.querySelectorAll('table tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('$ 3.000');
    fixture.destroy();
  });

  it('la dona muestra su leyenda con porcentaje', () => {
    TestBed.configureTestingModule({ imports: [ChartComponent] });
    const fixture = TestBed.createComponent(ChartComponent);
    fixture.componentRef.setInput('kind', 'doughnut');
    fixture.componentRef.setInput('labels', ['Efectivo', 'Tarjeta']);
    fixture.componentRef.setInput('series', [{ label: 'Medios de pago', data: [75, 25] }]);
    fixture.componentRef.setInput('ariaLabel', 'Medios de pago');
    fixture.detectChanges();
    const legend = (fixture.nativeElement as HTMLElement).querySelector('ul');
    expect(legend?.textContent).toContain('Efectivo');
    expect(legend?.textContent).toContain('75 %');
    fixture.destroy();
  });
});
