import { ROLE_CODE_PATTERN, roleCodeFrom } from './role-code';

describe('código de rol a partir del nombre', () => {
  it('convierte el nombre en un código válido', () => {
    expect(roleCodeFrom('Supervisor de caja')).toBe('SUPERVISOR_DE_CAJA');
    expect(roleCodeFrom('Bodeguero (turno 2)')).toBe('BODEGUERO_TURNO_2');
    expect(roleCodeFrom('Señora Peña')).toBe('SENORA_PENA');
  });

  it('siempre cumple el patrón del backend', () => {
    for (const name of ['', 'A', '¿?', '2do turno', 'x'.repeat(80), 'Rol con un nombre muy largo que pasa de cuarenta letras']) {
      expect(ROLE_CODE_PATTERN.test(roleCodeFrom(name))).toBeTrue();
    }
  });
});
