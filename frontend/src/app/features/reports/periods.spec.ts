import { daysBetween, isoDate, quickRange } from './periods';

describe('rangos rápidos', () => {
  const today = new Date(2026, 9, 5); // 5 de octubre de 2026

  it('formatea la fecha local', () => {
    expect(isoDate(today)).toBe('2026-10-05');
  });

  it('calcula los rangos', () => {
    expect(quickRange('today', today)).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(quickRange('yesterday', today)).toEqual({ from: '2026-10-04', to: '2026-10-04' });
    expect(quickRange('last7', today)).toEqual({ from: '2026-09-29', to: '2026-10-05' });
    expect(quickRange('thisMonth', today)).toEqual({ from: '2026-10-01', to: '2026-10-05' });
    expect(quickRange('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('el mes anterior de enero es diciembre del año anterior', () => {
    expect(quickRange('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});

describe('daysBetween', () => {
  it('lista todos los días del rango', () => {
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(daysBetween('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
  });

  it('rango inválido o vacío', () => {
    expect(daysBetween('2026-10-05', '2026-10-01')).toEqual([]);
    expect(daysBetween('', '2026-10-01')).toEqual([]);
  });
});
