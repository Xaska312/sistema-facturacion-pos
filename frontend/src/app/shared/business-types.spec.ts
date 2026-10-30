import { XICONS } from './icons/xicons';
import {
  BUSINESS_MODULES,
  BUSINESS_TYPES,
  businessTypeInfo,
  moduleAuthority,
  permissionModule,
  sortModules,
  withRequirements,
} from './business-types';
import { canChooseType } from './business-type-picker.component';

describe('tipos de negocio y módulos (Fase 12a)', () => {
  it('Comercio trae todos los módulos y solo Comercio y Servicios se eligen al crear', () => {
    expect(businessTypeInfo('RETAIL').defaultModules).toEqual(['CREDIT', 'ORDERS', 'QUOTES', 'VARIANTS', 'SCALE']);
    expect(businessTypeInfo('RESTAURANT').defaultModules).toEqual(['CREDIT', 'ORDERS', 'MODIFIERS', 'TABLES', 'KITCHEN']);
    expect(BUSINESS_TYPES.filter((t) => t.open).map((t) => t.label)).toEqual(['Comercio', 'Servicios']);
    expect([...BUSINESS_TYPES, ...BUSINESS_MODULES].every((x) => x.glyph in XICONS)).toBeTrue();
  });

  it('un tipo desconocido se muestra como Comercio', () => {
    expect(businessTypeInfo(null).code).toBe('RETAIL');
  });

  it('la autoridad del módulo es la del token y los módulos se ordenan como la lista', () => {
    expect(moduleAuthority('VARIANTS')).toBe('module:variants');
    expect(sortModules(['SCALE', 'CREDIT', 'SCALE'])).toEqual(['CREDIT', 'SCALE']);
    expect(permissionModule('credit:collect')).toBe('CREDIT');
    expect(permissionModule('quotes:read')).toBe('QUOTES');
    expect(permissionModule('modifiers:manage')).toBe('MODIFIERS');
    expect(permissionModule('kitchen:send')).toBe('KITCHEN');
    expect(permissionModule('sales:create')).toBeNull();
  });

  it('Cocina necesita Mesas: sin Mesas se apaga (Fase 12b-3)', () => {
    expect(withRequirements(['KITCHEN', 'CREDIT'])).toEqual(['CREDIT']);
    expect(withRequirements(['KITCHEN', 'TABLES'])).toEqual(['TABLES', 'KITCHEN']);
  });

  it('un tipo "Pronto" solo se elige si el negocio ya lo tiene', () => {
    const restaurant = businessTypeInfo('RESTAURANT');
    expect(canChooseType(restaurant, null)).toBeFalse();
    expect(canChooseType(restaurant, 'RETAIL')).toBeFalse();
    expect(canChooseType(restaurant, 'RESTAURANT')).toBeTrue();
    expect(canChooseType(businessTypeInfo('SERVICES'), 'RETAIL')).toBeTrue();
  });
});
