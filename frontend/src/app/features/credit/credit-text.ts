import { CreditAccount, CreditEntry, CreditEntryType } from '../../core/api/api.models';
import { formatDate } from '../../shared/format';
import { formatCop } from '../../shared/money';

/** Textos y enlaces del fiado (decisión 255). */

export const ENTRY_LABEL: Record<CreditEntryType, string> = {
  SALE: 'Venta fiada',
  SALE_VOID: 'Venta anulada',
  PAYMENT: 'Abono',
  PAYMENT_VOID: 'Abono anulado',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días de calendario (hora del equipo) desde la venta pendiente más antigua: 0 = hoy; null si no debe. */
export function debtDays(oldestDebtAt: string | null, now: Date = new Date()): number | null {
  if (!oldestDebtAt) {
    return null;
  }
  const since = new Date(oldestDebtAt);
  if (Number.isNaN(since.getTime())) {
    return null;
  }
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(now) - day(since)) / DAY_MS));
}

/** "Debe desde hoy", "Debe desde hace 1 día", "Debe desde hace 45 días". */
export function debtAgeLabel(oldestDebtAt: string | null, now: Date = new Date()): string | null {
  const days = debtDays(oldestDebtAt, now);
  if (days === null) {
    return null;
  }
  if (days === 0) {
    return 'Debe desde hoy';
  }
  return `Debe desde hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/** Qué tan vieja es la deuda: más de 60 días es alerta; de 31 a 60, aviso. */
export function debtSeverity(account: Pick<CreditAccount, 'over60Days' | 'from31To60Days' | 'balance'>):
  'danger' | 'warn' | 'ok' | 'none' {
  if (account.balance <= 0) {
    return 'none';
  }
  if (account.over60Days > 0) {
    return 'danger';
  }
  return account.from31To60Days > 0 ? 'warn' : 'ok';
}

/** Saldo para mostrar: "Debe $20.000", "Saldo a favor $5.000" o "Al día". */
export function balanceLabel(balance: number): string {
  if (balance > 0) {
    return `Debe ${formatCop(balance)}`;
  }
  return balance < 0 ? `Saldo a favor ${formatCop(-balance)}` : 'Al día';
}

/**
 * Celular para WhatsApp con el indicativo de Colombia: "300 123 4567" → "573001234567". Si no parece un celular
 * colombiano se usan los dígitos tal cual (otro país con indicativo); muy corto = sin número.
 */
export function whatsAppNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }
  return digits.length >= 11 ? digits : null;
}

/** Mensaje amable para recordar el saldo. */
export function reminderMessage(account: Pick<CreditAccount, 'name' | 'balance' | 'oldestDebtAt'>,
                                businessName: string): string {
  const firstName = account.name.trim().split(/\s+/)[0] ?? '';
  const since = account.oldestDebtAt ? `, pendiente desde el ${formatDate(account.oldestDebtAt)}` : '';
  return `Hola ${firstName}, te saludamos de ${businessName}. Te recordamos que tienes un saldo de `
    + `${formatCop(account.balance)}${since}. Puedes abonar cuando quieras. ¡Gracias!`;
}

/** Enlace de WhatsApp con el mensaje listo; sin número, WhatsApp pide elegir el contacto. */
export function whatsAppLink(account: Pick<CreditAccount, 'name' | 'balance' | 'oldestDebtAt' | 'phone'>,
                             businessName: string): string {
  const number = whatsAppNumber(account.phone);
  const text = encodeURIComponent(reminderMessage(account, businessName));
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Detalle de un movimiento del estado de cuenta. */
export function entryDetail(entry: CreditEntry): string {
  switch (entry.type) {
    case 'SALE':
      return entry.saleNumber ? `Venta ${entry.saleNumber}` : 'Venta';
    case 'SALE_VOID':
      return entry.saleNumber ? `Se anuló la venta ${entry.saleNumber}` : 'Venta anulada';
    case 'PAYMENT': {
      const parts = [entry.methodName ?? 'Abono'];
      if (entry.reference) {
        parts.push(`ref. ${entry.reference}`);
      }
      if (entry.notes) {
        parts.push(entry.notes);
      }
      return parts.join(' · ');
    }
    case 'PAYMENT_VOID':
      return entry.notes ? `Motivo: ${entry.notes}` : 'Abono anulado';
  }
}
