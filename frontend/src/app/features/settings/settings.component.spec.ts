import { confirmsName } from './settings.component';

describe('confirmsName', () => {
  it('acepta el nombre sin distinguir mayúsculas ni espacios de los extremos', () => {
    expect(confirmsName('  tienda ANA ', 'Tienda Ana')).toBeTrue();
    expect(confirmsName('Tienda An', 'Tienda Ana')).toBeFalse();
    expect(confirmsName('', 'Tienda Ana')).toBeFalse();
    expect(confirmsName('x', null)).toBeFalse();
  });
});
