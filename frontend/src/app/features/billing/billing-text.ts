import { BillingCycle } from '../../core/api/api.models';
import { BillingAddon, BillingPlan, PaymentRequestStatus, ProofCheck } from '../../core/api/billing.api';

/** Planes y pagos con Bre-B (decisión 302): cuentas de la pantalla, iguales a las del servidor. */

export const COUNTABLE: ReadonlySet<string> = new Set(['BRANCH', 'REGISTER', 'USER']);

/** Lo que se puede comprar aparte con el plan que quedará: sin precio o ya incluido, no se ofrece. */
export function addonsForSale(addons: BillingAddon[], included: string[]): BillingAddon[] {
  return addons.filter((a) => a.active && a.monthlyPrice !== null && (a.ref === null || !included.includes(a.ref)));
}

export function months(cycle: BillingCycle, periods: number): number {
  return cycle === 'ANNUAL' ? periods * 12 : periods;
}

export function planPrice(plan: BillingPlan | null, cycle: BillingCycle): number | null {
  if (!plan) {
    return null;
  }
  return cycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
}

/** Total del pedido: plan × periodos + cada adicional × cantidad × meses. */
export function orderTotal(plan: BillingPlan | null, cycle: BillingCycle, periods: number, addons: BillingAddon[],
                           chosen: Record<string, number>): number {
  const base = (planPrice(plan, cycle) ?? 0) * periods;
  const m = months(cycle, periods);
  return Math.round(addons.reduce((sum, a) => {
    const qty = chosen[a.code] ?? 0;
    return qty > 0 && a.monthlyPrice !== null ? sum + a.monthlyPrice * (COUNTABLE.has(a.kind) ? qty : 1) * m : sum;
  }, base));
}

/** Ahorro del plan anual frente a 12 meses (en %), o null. */
export function annualSaving(plan: BillingPlan): number | null {
  if (!plan.monthlyPrice || !plan.annualPrice) {
    return null;
  }
  const saving = 1 - plan.annualPrice / (plan.monthlyPrice * 12);
  return saving > 0.005 ? Math.round(saving * 100) : null;
}

export function statusLabel(status: PaymentRequestStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Esperando el pago';
    case 'SENT':
      return 'Comprobante enviado: lo estamos revisando';
    case 'APPROVED':
      return 'Pago aprobado';
    case 'REJECTED':
      return 'No pudimos confirmarlo';
    default:
      return 'Cancelado';
  }
}

/** Lo que Aska revisó del comprobante, una línea por punto. */
export function checkLines(check: ProofCheck, reference: string): { ok: boolean; text: string }[] {
  if (!check.readable) {
    return [{ ok: false, text: 'No se lee como un comprobante de transferencia.' }];
  }
  return [
    { ok: check.successful, text: check.successful ? 'Transferencia exitosa' : 'No dice que fue exitosa' },
    { ok: check.amountOk, text: check.amountOk ? 'El valor coincide' : 'El valor no coincide' },
    { ok: check.referenceOk, text: check.referenceOk ? `Trae la referencia ${reference}` : `No trae la referencia ${reference}` },
    { ok: check.destinationOk, text: check.destinationOk ? 'Llegó a la llave de XASKA' : 'No se ve la llave de XASKA' },
  ];
}
