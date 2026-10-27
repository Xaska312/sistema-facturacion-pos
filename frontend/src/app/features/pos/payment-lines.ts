import { CREDIT_METHOD_CODE, PaymentMethod } from '../../core/api/api.models';
import { formatCop } from '../../shared/money';
import { PaymentDraft, PaymentSummary, summarizePayments } from './sale-math';

/**
 * Pago con uno o varios medios (decisión 261): lo usan la entrega de un pedido y la venta de una cotización, como el
 * "Pago mixto" del POS. El efectivo puede pasarse del total (da cambio); tarjeta, transferencia y fiado no.
 */
export interface PaymentRequestLine {
  paymentMethodId: string;
  amount: number;
  reference: string | null;
}

/** Línea nueva con el medio dado y lo que falta (vacía si no falta nada). */
export function newPaymentLine(method: PaymentMethod | undefined, missing: number): PaymentDraft {
  return { methodId: method?.id ?? '', affectsCash: method?.affectsCash ?? false, amount: missing > 0 ? missing : null,
    reference: '' };
}

export function summarizeLines(total: number, lines: readonly PaymentDraft[]): PaymentSummary {
  return summarizePayments(total, [...lines]);
}

/** Lo fiado entre todas las líneas. */
export function creditAmount(lines: readonly PaymentDraft[], methods: readonly PaymentMethod[]): number {
  const credit = new Set(methods.filter((m) => m.code === CREDIT_METHOD_CODE).map((m) => m.id));
  return lines.filter((l) => credit.has(l.methodId)).reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
}

/**
 * Primer problema de los pagos para mostrarlo junto al botón; null si están bien. {@code creditAvailable}: cupo de
 * fiado disponible del cliente (null si no puede fiar).
 */
export function paymentLinesProblem(total: number, lines: readonly PaymentDraft[], methods: readonly PaymentMethod[],
                                    creditAvailable: number | null): string | null {
  if (total <= 0) {
    return null;
  }
  if (lines.length === 0) {
    return 'Elige cómo paga el cliente.';
  }
  const byId = new Map(methods.map((m) => [m.id, m]));
  for (const line of lines) {
    if (!byId.has(line.methodId)) {
      return 'Elige el medio de cada pago.';
    }
    if (!(Number(line.amount ?? 0) > 0)) {
      return 'Escribe el valor de cada pago (o quita la línea vacía).';
    }
  }
  if (new Set(lines.map((l) => l.methodId)).size !== lines.length) {
    return 'Hay un medio de pago repetido: junta esos valores en una sola línea.';
  }
  const summary = summarizeLines(total, lines);
  if (summary.nonCashExceeds) {
    return 'Solo el efectivo puede pasarse del total (para dar cambio).';
  }
  if (summary.missing > 0) {
    return `Faltan ${formatCop(summary.missing)}.`;
  }
  const credit = creditAmount(lines, methods);
  if (credit > 0 && (creditAvailable === null || credit > creditAvailable)) {
    return `El fiado pasa del cupo disponible (${formatCop(Math.max(0, creditAvailable ?? 0))}).`;
  }
  for (const line of lines) {
    const method = byId.get(line.methodId)!;
    if (method.requiresReference && !method.affectsCash && method.code !== CREDIT_METHOD_CODE && !line.reference.trim()) {
      return `Escribe la referencia del pago con ${method.name}.`;
    }
  }
  return null;
}

/** Lo que se envía al servidor: el efectivo con lo recibido (el servidor calcula el cambio). */
export function toPaymentRequests(lines: readonly PaymentDraft[], methods: readonly PaymentMethod[]): PaymentRequestLine[] {
  const byId = new Map(methods.map((m) => [m.id, m]));
  return lines.map((l) => {
    const method = byId.get(l.methodId);
    const plain = !method || method.affectsCash || method.code === CREDIT_METHOD_CODE;
    return { paymentMethodId: l.methodId, amount: Number(l.amount), reference: plain ? null : l.reference.trim() || null };
  });
}
