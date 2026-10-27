import { PaymentMethod } from '../../core/api/api.models';
import { PaymentDraft } from './sale-math';
import { creditAmount, newPaymentLine, paymentLinesProblem, toPaymentRequests } from './payment-lines';

const CASH: PaymentMethod = { id: 'cash', code: 'CASH', name: 'Efectivo', affectsCash: true, requiresReference: false };
const TRANSFER: PaymentMethod = { id: 'tr', code: 'TRANSFER', name: 'Transferencia', affectsCash: false, requiresReference: true };
const CREDIT: PaymentMethod = { id: 'cr', code: 'CREDIT', name: 'Fiado', affectsCash: false, requiresReference: false };
const METHODS = [CASH, TRANSFER, CREDIT];

const line = (method: PaymentMethod, amount: number | null, reference = ''): PaymentDraft =>
  ({ methodId: method.id, affectsCash: method.affectsCash, amount, reference });

describe('payment-lines (decisión 261)', () => {
  it('paga una parte en efectivo y fía el resto', () => {
    const lines = [line(CASH, 50000), line(CREDIT, 70000)];
    expect(paymentLinesProblem(120000, lines, METHODS, 100000)).toBeNull();
    expect(creditAmount(lines, METHODS)).toBe(70000);
    expect(toPaymentRequests(lines, METHODS)).toEqual([
      { paymentMethodId: 'cash', amount: 50000, reference: null },
      { paymentMethodId: 'cr', amount: 70000, reference: null },
    ]);
  });

  it('no deja fiar más del cupo ni sin cupo', () => {
    const lines = [line(CASH, 20000), line(CREDIT, 100000)];
    expect(paymentLinesProblem(120000, lines, METHODS, 50000)).toContain('cupo');
    expect(paymentLinesProblem(120000, lines, METHODS, null)).toContain('cupo');
  });

  it('avisa lo que falta y solo deja pasarse con efectivo', () => {
    expect(paymentLinesProblem(120000, [line(CASH, 100000)], METHODS, null)).toBe('Faltan $ 20.000.');
    expect(paymentLinesProblem(120000, [line(CASH, 150000)], METHODS, null)).toBeNull();
    expect(paymentLinesProblem(120000, [line(TRANSFER, 150000, 'abc')], METHODS, null)).toContain('efectivo');
  });

  it('exige referencia, medio y valor en cada línea, sin medios repetidos', () => {
    expect(paymentLinesProblem(10000, [line(TRANSFER, 10000)], METHODS, null)).toContain('referencia');
    expect(paymentLinesProblem(10000, [line(TRANSFER, 10000, 'N123')], METHODS, null)).toBeNull();
    expect(paymentLinesProblem(10000, [line(CASH, null)], METHODS, null)).toContain('valor');
    expect(paymentLinesProblem(10000, [{ ...line(CASH, 10000), methodId: '' }], METHODS, null)).toContain('medio');
    expect(paymentLinesProblem(10000, [line(CASH, 5000), line(CASH, 5000)], METHODS, null)).toContain('repetido');
    expect(paymentLinesProblem(10000, [], METHODS, null)).toContain('Elige');
    expect(paymentLinesProblem(0, [], METHODS, null)).toBeNull();
  });

  it('una línea nueva trae lo que falta', () => {
    expect(newPaymentLine(CASH, 3000)).toEqual({ methodId: 'cash', affectsCash: true, amount: 3000, reference: '' });
    expect(newPaymentLine(CREDIT, 0).amount).toBeNull();
  });
});
