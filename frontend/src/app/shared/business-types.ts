import { BusinessType } from '../core/api/api.models';
import { XIconName } from './icons/xicons';

/**
 * Tipos de negocio y módulos (Fase 12a, decisión 267). Espejo de BusinessType y BusinessModule del backend: el tipo
 * propone los módulos y el dueño los prende o apaga en Ajustes. Restaurante y Farmacia salen como "Pronto" (solo los
 * asigna la consola de plataforma a negocios piloto).
 */
export type BusinessModule = 'CREDIT' | 'ORDERS' | 'QUOTES' | 'VARIANTS' | 'SCALE' | 'MODIFIERS' | 'TABLES' | 'KITCHEN';

export interface BusinessTypeInfo {
  code: BusinessType;
  label: string;
  description: string;
  glyph: XIconName;
  /** Se puede elegir al crear el negocio o en Ajustes. */
  open: boolean;
  defaultModules: readonly BusinessModule[];
}

export interface BusinessModuleInfo {
  code: BusinessModule;
  label: string;
  description: string;
  glyph: XIconName;
  /** Módulo que necesita encendido (Cocina se alimenta de las cuentas de Mesas). */
  requires?: BusinessModule;
}

export const BUSINESS_TYPES: readonly BusinessTypeInfo[] = [
  { code: 'RETAIL', label: 'Comercio', description: 'Tienda, papelería, ropa, ferretería, distribuidora…', glyph: 'type-retail',
    open: true, defaultModules: ['CREDIT', 'ORDERS', 'QUOTES', 'VARIANTS', 'SCALE'] },
  { code: 'SERVICES', label: 'Servicios', description: 'Taller, impresiones, instalaciones, mantenimiento…',
    glyph: 'type-services', open: true, defaultModules: ['CREDIT', 'ORDERS', 'QUOTES'] },
  { code: 'RESTAURANT', label: 'Restaurante', description: 'Mesas, comandas y cocina.', glyph: 'type-restaurant',
    open: false, defaultModules: ['CREDIT', 'ORDERS', 'MODIFIERS', 'TABLES', 'KITCHEN'] },
  { code: 'PHARMACY', label: 'Farmacia', description: 'Lotes, vencimientos y factura electrónica.', glyph: 'type-pharmacy',
    open: false, defaultModules: ['CREDIT', 'ORDERS', 'QUOTES'] },
];

export const BUSINESS_MODULES: readonly BusinessModuleInfo[] = [
  { code: 'CREDIT', label: 'Fiados', description: 'Vender a crédito con cupo por cliente y recibir abonos.', glyph: 'credit' },
  { code: 'ORDERS', label: 'Pedidos', description: 'Encargos con anticipo y fecha de entrega.', glyph: 'orders' },
  { code: 'QUOTES', label: 'Cotizaciones', description: 'Cotizaciones en PDF que se convierten en venta o pedido.', glyph: 'quotes' },
  { code: 'VARIANTS', label: 'Tallas y colores', description: 'Productos con tallas y colores (calzado, ropa).', glyph: 'variants' },
  { code: 'SCALE', label: 'Báscula', description: 'Etiquetas de báscula y venta por peso con código.', glyph: 'scale' },
  { code: 'MODIFIERS', label: 'Adiciones', description: 'Tamaños, extras con precio y notas por producto ("sin cebolla").',
    glyph: 'modifiers' },
  { code: 'TABLES', label: 'Mesas', description: 'Mesas por zona y cuentas abiertas: mesa, para llevar y domicilio.',
    glyph: 'tables' },
  { code: 'KITCHEN', label: 'Cocina y comandas', description: 'Enviar lo pedido a cocina y bar, e imprimir comandas.',
    glyph: 'kitchen', requires: 'TABLES' },
];

export function businessTypeInfo(code: BusinessType | null | undefined): BusinessTypeInfo {
  return BUSINESS_TYPES.find((t) => t.code === code) ?? BUSINESS_TYPES[0];
}

/** Autoridad del token cuando el módulo está encendido (p. ej. "module:credit"). */
export function moduleAuthority(module: BusinessModule): string {
  return `module:${module.toLowerCase()}`;
}

/** Permisos de roles que solo valen con su módulo encendido (espejo de BusinessModule.permissions del backend). */
const MODULE_BY_PERMISSION_PREFIX: Readonly<Record<string, BusinessModule>> = {
  credit: 'CREDIT',
  orders: 'ORDERS',
  quotes: 'QUOTES',
  modifiers: 'MODIFIERS',
  tables: 'TABLES',
  kitchen: 'KITCHEN',
};

/** Módulo del que depende un permiso de rol, o null si es de la base. */
export function permissionModule(permission: string): BusinessModule | null {
  return MODULE_BY_PERMISSION_PREFIX[permission.split(':')[0]] ?? null;
}

/** Módulos en el orden de la lista (para comparar y mostrar). */
export function sortModules(modules: Iterable<BusinessModule>): BusinessModule[] {
  const set = new Set(modules);
  return BUSINESS_MODULES.map((m) => m.code).filter((code) => set.has(code));
}

/** Quita los módulos a los que les falta el que necesitan (al apagar Mesas se apaga Cocina). */
export function withRequirements(modules: Iterable<BusinessModule>): BusinessModule[] {
  const set = new Set(modules);
  return sortModules([...set].filter((code) => {
    const needs = BUSINESS_MODULES.find((m) => m.code === code)?.requires;
    return !needs || set.has(needs);
  }));
}
