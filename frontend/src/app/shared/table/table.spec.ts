import { formatCell, initialQuery, isNumericKind, nextSort, sortDirection, toPageQuery } from './table';

describe('table helpers', () => {
  it('cicla el orden: ascendente → descendente → predeterminado', () => {
    expect(nextSort(null, 'name')).toBe('name,asc');
    expect(nextSort('name,asc', 'name')).toBe('name,desc');
    expect(nextSort('name,desc', 'name')).toBeNull();
    expect(nextSort('code,asc', 'name')).toBe('name,asc');
  });

  it('dirección del orden por columna', () => {
    expect(sortDirection('name,desc', 'name')).toBe('desc');
    expect(sortDirection('name,asc', 'sku')).toBeNull();
    expect(sortDirection(null, 'sku')).toBeNull();
  });

  it('convierte la consulta para la API', () => {
    expect(toPageQuery(initialQuery(50, 'code,asc'))).toEqual({ page: 0, size: 50, sort: 'code,asc' });
    expect(toPageQuery(initialQuery())).toEqual({ page: 0, size: 20 });
  });

  it('formatea celdas por tipo', () => {
    expect(formatCell(2500, 'money')).toContain('2.500');
    expect(formatCell(0.5, 'number')).toBe('0,5');
    expect(formatCell(null, 'text')).toBe('—');
    expect(formatCell('', 'mono')).toBe('—');
    expect(formatCell('POS-1', 'mono')).toBe('POS-1');
    expect(isNumericKind('money')).toBeTrue();
    expect(isNumericKind('date')).toBeFalse();
  });
});
