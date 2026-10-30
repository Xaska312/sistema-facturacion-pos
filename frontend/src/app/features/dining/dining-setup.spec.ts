import { nextTableNames } from './dining-setup.component';

describe('configurar mesas (Fase 12b-2)', () => {
  it('numera las mesas nuevas saltando las que ya existen', () => {
    expect(nextTableNames([], 1, 3)).toEqual(['1', '2', '3']);
    expect(nextTableNames(['1', '3', 'Barra'], 1, 3)).toEqual(['2', '4', '5']);
    expect(nextTableNames(['10'], 9, 2)).toEqual(['9', '11']);
  });
});
