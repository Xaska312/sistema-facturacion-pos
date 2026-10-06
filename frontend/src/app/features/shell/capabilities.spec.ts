import { describeCapabilities, firstName, greeting, joinSpanish, quickActions } from './capabilities';

describe('capacidades en lenguaje natural', () => {
  it('describe un cajero sin códigos técnicos', () => {
    const cashier = new Set(['branches:read', 'products:read', 'parties:read', 'parties:manage', 'inventory:read',
      'cash:operate', 'cash:read', 'sales:create', 'sales:read']);
    const text = describeCapabilities(cashier);
    expect(text).toEqual([
      'vender',
      'abrir, mover y cerrar caja',
      'consultar las ventas',
      'ver el historial de caja',
      'consultar productos',
      'consultar existencias y kardex',
      'registrar clientes y proveedores',
    ]);
    expect(text.join(' ')).not.toContain(':');
  });

  it('no repite "consultar" cuando puede administrar', () => {
    const text = describeCapabilities(new Set(['products:read', 'products:manage']));
    expect(text).toEqual(['administrar productos, categorías y precios']);
  });

  it('une en español', () => {
    expect(joinSpanish([])).toBe('');
    expect(joinSpanish(['vender'])).toBe('vender');
    expect(joinSpanish(['vender', 'abrir caja'])).toBe('vender y abrir caja');
    expect(joinSpanish(['a', 'b', 'c'])).toBe('a, b y c');
  });

  it('saluda según la hora y usa el primer nombre', () => {
    expect(greeting(new Date(2026, 9, 5, 8))).toBe('Buenos días');
    expect(greeting(new Date(2026, 9, 5, 12))).toBe('Buenas tardes');
    expect(greeting(new Date(2026, 9, 5, 19))).toBe('Buenas noches');
    expect(firstName('  Ana María Pérez ')).toBe('Ana');
    expect(firstName(null)).toBe('');
  });

  it('ofrece los accesos rápidos según los permisos (máximo 6)', () => {
    const seller = quickActions(new Set(['sales:create', 'sales:read', 'products:read', 'inventory:read']));
    expect(seller.map((a) => a.label)).toEqual(['Vender', 'Existencias', 'Ventas']);
    const owner = quickActions(new Set(['sales:create', 'cash:operate', 'products:manage', 'inventory:read', 'sales:read',
      'reports:read', 'parties:read']));
    expect(owner.length).toBe(6);
    expect(owner[0].label).toBe('Vender');
  });
});
