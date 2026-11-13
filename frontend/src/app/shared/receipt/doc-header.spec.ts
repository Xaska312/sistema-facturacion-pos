import { businessLines, headerLines } from './doc-header';

describe('Encabezado de los documentos (decisión 331)', () => {
  it('toma un dato por renglón, sin renglones vacíos', () => {
    expect(headerLines('NIT: 900.123.456-7\r\n\n  Calle 10 # 5-20, Centro \nCel: 300 123 4567'))
      .toEqual(['NIT: 900.123.456-7', 'Calle 10 # 5-20, Centro', 'Cel: 300 123 4567']);
    expect(headerLines(null)).toEqual([]);
  });

  it('el encabezado del dueño reemplaza la dirección y el teléfono de la sede', () => {
    const branch = { branchName: 'Sede principal', branchAddress: 'Calle 10', branchPhone: '3001234567' };
    expect(businessLines(branch)).toEqual(['Sede principal', 'Calle 10', 'Tel. 3001234567']);
    expect(businessLines({ ...branch, header: 'NIT: 900\nCel: 315' })).toEqual(['Sede principal', 'NIT: 900', 'Cel: 315']);
    expect(businessLines({ ...branch, header: 'NIT: 900' }, false)).toEqual(['NIT: 900']);
  });
});
