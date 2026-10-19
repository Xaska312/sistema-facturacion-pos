import { CreditEntry } from '../../core/api/api.models';
import {
  balanceLabel,
  debtAgeLabel,
  debtDays,
  debtSeverity,
  entryDetail,
  reminderMessage,
  whatsAppLink,
  whatsAppNumber,
} from './credit-text';

describe('credit-text', () => {
  const now = new Date('2026-10-19T15:00:00Z');

  it('cuenta los días de la deuda más vieja', () => {
    expect(debtDays(null, now)).toBeNull();
    expect(debtDays('2026-10-19T08:00:00Z', now)).toBe(0);
    expect(debtDays('2026-09-04T15:00:00Z', now)).toBe(45);
    expect(debtAgeLabel('2026-10-18T14:00:00Z', now)).toBe('Debe desde hace 1 día');
    expect(debtAgeLabel('2026-10-19T14:00:00Z', now)).toBe('Debe desde hoy');
  });

  it('marca la deuda vieja', () => {
    expect(debtSeverity({ balance: 0, over60Days: 0, from31To60Days: 0 })).toBe('none');
    expect(debtSeverity({ balance: 10, over60Days: 0, from31To60Days: 0 })).toBe('ok');
    expect(debtSeverity({ balance: 10, over60Days: 0, from31To60Days: 10 })).toBe('warn');
    expect(debtSeverity({ balance: 10, over60Days: 5, from31To60Days: 5 })).toBe('danger');
  });

  it('describe el saldo', () => {
    expect(balanceLabel(0)).toBe('Al día');
    expect(balanceLabel(20000)).toContain('Debe');
    expect(balanceLabel(-5000)).toContain('Saldo a favor');
  });

  it('arma el número de WhatsApp con el indicativo de Colombia', () => {
    expect(whatsAppNumber('300 123 4567')).toBe('573001234567');
    expect(whatsAppNumber('+57 300-123-4567')).toBe('573001234567');
    expect(whatsAppNumber('6012345')).toBeNull();
    expect(whatsAppNumber(null)).toBeNull();
  });

  it('el recordatorio lleva el nombre, el negocio y el saldo', () => {
    const account = { name: 'Marta Gómez', balance: 20000, oldestDebtAt: null, phone: '3001234567' };
    const message = reminderMessage(account, 'Tienda Doña Ana');
    expect(message).toContain('Hola Marta');
    expect(message).toContain('Tienda Doña Ana');
    expect(message).toContain('20.000');
    const link = whatsAppLink(account, 'Tienda Doña Ana');
    expect(link.startsWith('https://wa.me/573001234567?text=')).toBeTrue();
    expect(decodeURIComponent(link.split('text=')[1])).toBe(message);
    expect(whatsAppLink({ ...account, phone: null }, 'X').startsWith('https://wa.me/?text=')).toBeTrue();
  });

  it('describe cada movimiento', () => {
    const base = {
      id: 'e', entryNo: 1, amount: 0, balanceAfter: 0, saleId: null, saleNumber: null, paymentId: null, methodCode: null,
      methodName: null, reference: null, notes: null, createdByName: null, createdAt: '', voided: false, voidReason: null,
      voidedAt: null,
    } satisfies Omit<CreditEntry, 'type'>;
    expect(entryDetail({ ...base, type: 'SALE', saleNumber: 'POS-7' })).toBe('Venta POS-7');
    expect(entryDetail({ ...base, type: 'PAYMENT', methodName: 'Transferencia', reference: 'N1' }))
      .toBe('Transferencia · ref. N1');
    expect(entryDetail({ ...base, type: 'PAYMENT_VOID', notes: 'Error' })).toBe('Motivo: Error');
  });
});
