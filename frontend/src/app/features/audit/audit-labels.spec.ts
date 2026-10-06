import { actionLabel, actionOptions, dataRows, displayValue, entityLabel, entityOptions } from './audit-labels';

describe('audit-labels', () => {
  it('nombra las acciones conocidas y arma las genéricas con verbo y sustantivo', () => {
    expect(actionLabel('SALE_VOIDED', 'sale')).toBe('Anuló una venta');
    expect(actionLabel('PRODUCT_CREATED', 'product')).toBe('Creó producto');
    expect(actionLabel('CASH_REGISTER_DEACTIVATED', 'cash_register')).toBe('Desactivó caja');
    expect(actionLabel('ROLE_DELETED', 'role')).toBe('Eliminó rol');
    expect(actionLabel('THING_UPDATED', 'thing')).toBe('Modificó');
    expect(actionLabel('ALGO_RARO', 'x')).toBe('ALGO_RARO');
  });

  it('nombra los módulos y deja el código si no lo conoce', () => {
    expect(entityLabel('cash_session')).toBe('Turno de caja');
    expect(entityLabel('nuevo')).toBe('nuevo');
  });

  it('muestra valores legibles', () => {
    expect(displayValue(null)).toBe('—');
    expect(displayValue('')).toBe('—');
    expect(displayValue(true)).toBe('Sí');
    expect(displayValue(false)).toBe('No');
    expect(displayValue(['a', 'b'])).toBe('a, b');
    expect(displayValue([])).toBe('—');
    expect(displayValue(12.5)).toBe('12.5');
    expect(displayValue({ a: 1 })).toBe('{"a":1}');
  });

  it('marca solo lo que cambió cuando hay antes y después', () => {
    const rows = dataRows({ name: 'Café', price: 1000, active: true }, { name: 'Café molido', price: 1000, active: true });
    expect(rows.map((r) => [r.label, r.before, r.after, r.changed])).toEqual([
      ['Nombre', 'Café', 'Café molido', true],
      ['Precio', '1000', '1000', false],
      ['Activo', 'Sí', 'Sí', false],
    ]);
  });

  it('en una creación nada se marca como cambio y lo de antes queda vacío', () => {
    const rows = dataRows(null, { code: 'NORTE', phone: null });
    expect(rows.every((r) => !r.changed)).toBeTrue();
    expect(rows[0]).toEqual({ field: 'code', label: 'Código', before: '—', after: 'NORTE', changed: false });
  });

  it('incluye los datos que solo estaban antes', () => {
    const rows = dataRows({ name: 'A', legacy: 'x' }, { name: 'A' });
    expect(rows.map((r) => r.field)).toEqual(['name', 'legacy']);
    expect(rows[1].changed).toBeTrue();
  });

  it('arma las opciones de filtro por módulo', () => {
    const options = [
      { entity: 'product', action: 'PRODUCT_CREATED' },
      { entity: 'product', action: 'PRODUCT_UPDATED' },
      { entity: 'sale', action: 'SALE_CREATED' },
    ];
    expect(entityOptions(options).map((o) => o.label)).toEqual(['Producto', 'Venta']);
    expect(actionOptions(options, 'product').map((o) => o.value)).toEqual(['PRODUCT_CREATED', 'PRODUCT_UPDATED']);
    expect(actionOptions(options, null).length).toBe(3);
  });
});
