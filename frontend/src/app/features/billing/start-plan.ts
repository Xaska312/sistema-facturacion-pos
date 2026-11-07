/**
 * El plan que la persona eligió en "Planes y precios" antes de registrarse (decisión 303): se recuerda en este
 * navegador para proponerlo al crear el negocio. Si el almacenamiento no está disponible, simplemente no se recuerda.
 */
export interface StartPlan {
  plan: string;
  annual: boolean;
}

const KEY = 'xaska.startPlan';

export function rememberStartPlan(plan: string | null, cycle: string | null): void {
  if (!plan || !/^[A-Z][A-Z0-9_]{1,19}$/.test(plan)) {
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ plan, annual: cycle === 'anual' }));
  } catch {
    // Sin almacenamiento: no pasa nada.
  }
}

export function readStartPlan(): StartPlan | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<StartPlan>) : null;
    return v && typeof v.plan === 'string' ? { plan: v.plan, annual: v.annual === true } : null;
  } catch {
    return null;
  }
}

export function clearStartPlan(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}
