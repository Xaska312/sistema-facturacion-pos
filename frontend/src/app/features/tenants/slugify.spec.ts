import { slugify } from './slugify';

describe('slugify', () => {
  it('quita tildes, espacios y símbolos', () => {
    expect(slugify('Tienda Doña Ana!')).toBe('tienda_dona_ana');
  });

  it('antepone letra si empieza por número', () => {
    expect(slugify('24 Horas')).toBe('n_24_horas');
  });

  it('cumple el patrón del backend', () => {
    expect(/^[a-z][a-z0-9_]{2,40}$/.test(slugify('Droguería La Esquina del Barrio Central de Bogotá'))).toBeTrue();
  });
});
