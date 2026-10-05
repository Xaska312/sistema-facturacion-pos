import { filenameFromDisposition } from './download';

describe('filenameFromDisposition', () => {
  it('usa filename* en UTF-8 cuando existe', () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''ventas_2026-10-05.csv", 'x.csv'))
      .toBe('ventas_2026-10-05.csv');
    expect(filenameFromDisposition("attachment; filename=\"a.csv\"; filename*=UTF-8''categor%C3%ADas.csv", 'x.csv'))
      .toBe('categorías.csv');
  });

  it('usa filename o el nombre por defecto', () => {
    expect(filenameFromDisposition('attachment; filename="impuestos.csv"', 'x.csv')).toBe('impuestos.csv');
    expect(filenameFromDisposition(null, 'reporte.csv')).toBe('reporte.csv');
  });
});
