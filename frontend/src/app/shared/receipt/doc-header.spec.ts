import { businessLines, headerLines } from './doc-header';

describe('Encabezado de los documentos (decisión 331)', () => {
  it('toma un dato por renglón, sin renglones vacíos', () => {
    expect(headerLines('NIT: 1006122824-9\r\n\n  Cra. 138 #7-45 Ceiba \nCel: 3155145472'))
      .toEqual(['NIT: 1006122824-9', 'Cra. 138 #7-45 Ceiba', 'Cel: 3155145472']);
    expect(headerLines(null)).toEqual([]);
  });

  it('el encabezado del dueño reemplaza la dirección y el teléfono de la sede', () => {
    const branch = { branchName: 'Sede principal', branchAddress: 'Calle 10', branchPhone: '3001234567' };
    expect(businessLines(branch)).toEqual(['Sede principal', 'Calle 10', 'Tel. 3001234567']);
    expect(businessLines({ ...branch, header: 'NIT: 900\nCel: 315' })).toEqual(['Sede principal', 'NIT: 900', 'Cel: 315']);
    expect(businessLines({ ...branch, header: 'NIT: 900' }, false)).toEqual(['NIT: 900']);
  });
});
