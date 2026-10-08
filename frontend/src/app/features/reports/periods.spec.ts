import {
  addDays,
  businessToday,
  daysBetween,
  isoDate,
  periodFromParams,
  periodLabel,
  periodToParams,
  previousRange,
  quickRange,
  resolvePeriod,
  shortDate,
} from './periods';

describe('rangos rápidos', () => {
  const today = new Date(2026, 9, 5); // 5 de octubre de 2026

  it('formatea la fecha local', () => {
    expect(isoDate(today)).toBe('2026-10-05');
  });

  it('calcula los rangos', () => {
    expect(quickRange('today', today)).toEqual({ from: '2026-10-05', to: '2026-10-05' });
    expect(quickRange('yesterday', today)).toEqual({ from: '2026-10-04', to: '2026-10-04' });
    expect(quickRange('last7', today)).toEqual({ from: '2026-09-29', to: '2026-10-05' });
    expect(quickRange('last30', today)).toEqual({ from: '2026-09-06', to: '2026-10-05' });
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
    // Más de un año (el servidor admite hasta 367 días): vacío, y la URL cae en el periodo predeterminado (QA UI-9)
    expect(daysBetween('2026-01-01', '2027-01-02').length).toBe(367);
    expect(daysBetween('2024-01-01', '2026-01-01')).toEqual([]);
  });
});

describe('hoy del negocio (QA DIN-6)', () => {
  it('usa el día de Colombia aunque el equipo esté en otra zona', () => {
    // 2 a. m. en UTC del 7 de octubre = 9 p. m. del 6 de octubre en Bogotá
    expect(isoDate(businessToday(new Date('2026-10-07T02:00:00Z')))).toBe('2026-10-06');
    expect(isoDate(businessToday(new Date('2026-10-07T15:00:00Z')))).toBe('2026-10-07');
  });
});

describe('periodo en la URL', () => {
  const params = (values: Record<string, string>) => (name: string): string | null => values[name] ?? null;

  it('lee el periodo, el rango y la sucursal', () => {
    expect(periodFromParams(params({ periodo: '7d', sucursal: 'b1' })))
      .toEqual({ period: 'last7', from: null, to: null, branchId: 'b1' });
    expect(periodFromParams(params({ periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-03' })))
      .toEqual({ period: 'custom', from: '2026-10-01', to: '2026-10-03', branchId: null });
  });

  it('un rango inválido o un periodo desconocido toman el predeterminado', () => {
    expect(periodFromParams(params({ periodo: 'rango', desde: '2026-10-05', hasta: '2026-10-01' })).period).toBe('today');
    expect(periodFromParams(params({ periodo: 'siempre' }), 'thisMonth').period).toBe('thisMonth');
  });

  it('escribe solo los parámetros necesarios', () => {
    expect(periodToParams({ period: 'last30', from: null, to: null, branchId: 'b' }))
      .toEqual({ periodo: '30d', desde: null, hasta: null, sucursal: 'b' });
    expect(periodToParams({ period: 'custom', from: '2026-10-01', to: '2026-10-03', branchId: null }))
      .toEqual({ periodo: 'rango', desde: '2026-10-01', hasta: '2026-10-03', sucursal: null });
  });
});

describe('comparación con el periodo anterior', () => {
  it('toma el mismo número de días justo antes', () => {
    expect(previousRange({ from: '2026-10-01', to: '2026-10-05' })).toEqual({ from: '2026-09-26', to: '2026-09-30' });
    expect(previousRange({ from: '2026-10-05', to: '2026-10-05' })).toEqual({ from: '2026-10-04', to: '2026-10-04' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-01-29', to: '2026-02-28' });
  });

  it('resuelve el periodo y lo describe', () => {
    const today = new Date(2026, 9, 5);
    expect(resolvePeriod({ period: 'yesterday', from: null, to: null, branchId: null }, today))
      .toEqual({ from: '2026-10-04', to: '2026-10-04' });
    expect(periodLabel({ period: 'last7', from: null, to: null, branchId: null }, { from: '', to: '' }))
      .toBe('Últimos 7 días');
    expect(shortDate('2026-10-05')).toBe('lun 5 oct');
    expect(addDays('2026-10-05', -6)).toBe('2026-09-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
