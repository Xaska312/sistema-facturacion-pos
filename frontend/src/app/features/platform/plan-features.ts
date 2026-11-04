import { PlanFeature } from '../../core/api/api.models';
import { BUSINESS_MODULES } from '../../shared/business-types';

/** Funciones que dependen del plan (decisión 288), con sus nombres para la consola y Ajustes. */
export const PLAN_FEATURES: readonly { code: PlanFeature; label: string; description: string }[] = [
  { code: 'PURCHASES', label: 'Compras', description: 'Recepción de mercancía y cuentas por pagar' },
  { code: 'DIRECT_PRINT', label: 'Impresión directa', description: 'XASKA Impresora y "Abrir cajón"' },
  { code: 'AUDIT', label: 'Auditoría', description: 'Quién hizo qué y cuándo' },
  { code: 'TRANSFERS', label: 'Traslados', description: 'Mover mercancía entre sedes' },
  { code: 'ZONE_REGISTERS', label: 'Caja por zona', description: 'Cada piso o zona con su caja' },
];

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
