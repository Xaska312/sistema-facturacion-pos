import { PlanFeature } from '../../core/api/api.models';
import { BUSINESS_MODULES } from '../../shared/business-types';

/**
 * Funciones que dependen del plan (decisión 288), con sus nombres para la consola y Ajustes. {@code addOn}: adicional
 * pagado que ningún plan trae y se da como extra a cada negocio (XASKA IA, decisión 295).
 */
export const PLAN_FEATURES: readonly { code: PlanFeature; label: string; description: string; addOn?: boolean }[] = [
  { code: 'PURCHASES', label: 'Compras', description: 'Recepción de mercancía y cuentas por pagar' },
  { code: 'DIRECT_PRINT', label: 'Impresión directa', description: 'XASKA Impresora y "Abrir cajón"' },
  { code: 'AUDIT', label: 'Auditoría', description: 'Quién hizo qué y cuándo' },
  { code: 'TRANSFERS', label: 'Traslados', description: 'Mover mercancía entre sedes' },
  { code: 'ZONE_REGISTERS', label: 'Caja por zona', description: 'Cada piso o zona con su caja' },
  { code: 'AI', label: 'XASKA IA', description: 'Adicional pagado: leer facturas de compra con foto o PDF', addOn: true },
];

/** Las que puede incluir un plan (sin los adicionales). */
export const PLAN_ONLY_FEATURES = PLAN_FEATURES.filter((f) => !f.addOn);

export function featureLabel(code: string): string {
  return PLAN_FEATURES.find((f) => f.code === code)?.label ?? code;
}

export function moduleLabel(code: string): string {
  return BUSINESS_MODULES.find((m) => m.code === code)?.label ?? code;
}

/** "Fiados, Mesas · Compras, Auditoría" (o "Lo esencial"). */
export function includedText(modules: readonly string[], features: readonly string[]): string {
  const parts = [modules.map(moduleLabel).join(', '), features.map(featureLabel).join(', ')].filter((x) => x);
  return parts.length ? parts.join(' · ') : 'Lo esencial';
}

/** Agrega o quita un código de una lista (casillas). */
export function toggle<T extends string>(list: readonly T[], code: T, on: boolean): T[] {
  return on ? (list.includes(code) ? [...list] : [...list, code]) : list.filter((c) => c !== code);
}
