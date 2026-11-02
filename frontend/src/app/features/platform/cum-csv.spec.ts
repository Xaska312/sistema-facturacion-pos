import { batches, parseCsv, parseCumCsv } from './cum-csv';

const HEADER = '"expediente","producto","titular","registrosanitario","fechaexpedicion","fechavencimiento",'
  + '"estadoregistro","expedientecum","consecutivocum","cantidadcum","descripcioncomercial","estadocum","fechaactivo",'
  + '"fechainactivo","muestramedica","unidad","atc","descripcionatc","viaadministracion","concentracion",'
  + '"principioactivo","unidadmedida","cantidad","unidadreferencia","formafarmaceutica","nombrerol","tiporol",'
  + '"modalidad","IUM"';

function row(cum: string, cons: string, opts: Partial<Record<string, string>> = {}): string {
  const v = {
    producto: 'DOLEX FORTE', titular: 'GSK', registro: 'INVIMA 2019M-0001', estado: 'Activo', muestra: 'No',
    principio: 'ACETAMINOFEN', unidadmedida: 'mg', cantidad: '500', referencia: 'TABLETA', forma: 'TABLETA',
    descripcion: 'CAJA X 100 TABLETAS, EN BLISTER', rol: 'GSK PLANTA', ...opts,
  };
  return [cum, v.producto, v.titular, v.registro, '01/01/2020', '', 'Vigente', cum, cons, '100', v.descripcion,
    v.estado, '01/01/2020', '', v.muestra, 'U', 'N02BE51', 'PARACETAMOL', 'ORAL', 'A', v.principio, v.unidadmedida,
    v.cantidad, v.referencia, v.forma, v.rol, 'FABRICANTE', 'FABRICAR Y VENDER', '']
    .map((x) => `"${x.replace(/"/g, '""')}"`).join(',');
}

describe('cum-csv (Fase 13-1, decisión 279)', () => {
  it('lee comillas, comas y saltos de línea dentro de un campo', () => {
    expect(parseCsv('a,"b, c","d ""e""\nf"\r\n1,2,3\n')).toEqual([['a', 'b, c', 'd "e"\nf'], ['1', '2', '3']]);
  });

  it('una fila por CUM activo, sin muestras, con los principios activos juntos y sin repetir por fabricante', () => {
    const csv = ['﻿' + HEADER,
      row('20001', '1'),
      row('20001', '1', { principio: 'CAFEINA', cantidad: '65', rol: 'OTRA PLANTA' }),
      row('20001', '1', { rol: 'IMPORTADOR' }),
      row('20001', '2', { estado: 'Inactivo' }),
      row('20001', '3', { muestra: 'Si' }),
      row('30002', '01', { producto: 'TRAMADOL', principio: 'TRAMADOL', cantidad: '50', referencia: '1 ML',
        forma: 'SOLUCION INYECTABLE' }),
      row('abc', '1'),
    ].join('\n');
    const result = parseCumCsv(csv);
    expect(result.lines).toBe(7);
    expect(result.inactive).toBe(1);
    expect(result.samples).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.rows.length).toBe(2);
    const dolex = result.rows.find((r) => r.cum === '20001-1')!;
    expect(dolex.activeIngredients).toBe('ACETAMINOFEN 500 mg + CAFEINA 65 mg');
    expect(dolex.presentation).toBe('CAJA X 100 TABLETAS, EN BLISTER');
    expect(dolex.sanitaryRegistration).toBe('INVIMA 2019M-0001');
    expect(result.rows.find((r) => r.cum === '30002-1')!.activeIngredients).toBe('TRAMADOL 50 mg / 1 ML');
  });

  it('avisa si no es el archivo del CUM', () => {
    expect(() => parseCumCsv('nombre,precio\nx,1')).toThrowError(/No parece el CSV del CUM/);
  });

  it('parte en tandas', () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
